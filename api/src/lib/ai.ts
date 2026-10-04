import Anthropic from '@anthropic-ai/sdk';

/**
 * AI bottle recognition: reads a whisky bottle photo with Claude (vision),
 * fills in what the label shows, and runs a web search restricted to a small
 * set of whisky reference sites for anything the label does not show.
 * Fields that cannot be determined are returned as null.
 */

export type RecognitionLanguage = 'en' | 'fi';

export interface RecognizedWhiskey {
  name: string | null;
  distillery: string | null;
  region: string | null;
  age: number | null;
  abv: number | null;
  description: string | null;
  /** URLs of web pages the model consulted, if it searched. */
  sources: string[];
}

export type RecognitionMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export const AI_MODEL = 'claude-opus-5-5';

/** Whisky reference sites the scoped search may use. */
export const SEARCH_ALLOWED_DOMAINS = [
  'whiskybase.com',
  'masterofmalt.com',
  'thewhiskyexchange.com',
  'alko.fi',
];

// SWA managed functions time out at ~45 s; leave headroom for the response.
const TOTAL_BUDGET_MS = 40_000;
const MIN_CONTINUATION_BUDGET_MS = 8_000;
const MAX_CONTINUATIONS = 2;
const MAX_SOURCES = 5;

const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: nullableString,
    distillery: nullableString,
    region: nullableString,
    age: nullableNumber,
    abv: nullableNumber,
    description: nullableString,
  },
  required: ['name', 'distillery', 'region', 'age', 'abv', 'description'],
  additionalProperties: false,
};

const LANGUAGE_NAMES: Record<RecognitionLanguage, string> = {
  en: 'English',
  fi: 'Finnish',
};

function systemPrompt(language: RecognitionLanguage): string {
  return [
    'You identify whisky bottles from photos for a whisky tasting app.',
    'First read everything you can from the label in the image: the product name, distillery, region, age statement and ABV.',
    'Only if the label does not show a field, you may use web search to look that field up, and only for the exact bottle you identified from the label. Do not search for anything else.',
    'If you cannot identify the bottle confidently, do not search; return null for every field you cannot read.',
    'Never guess. Use null for any field you could not determine from the label or a search result about this exact bottle.',
    'Field rules: name is the full product name as sold (for example "Lagavulin 16"); distillery is the producing distillery or brand; region is the whisky region or country (for example "Islay", "Speyside", "Japan"); age is the age statement in whole years, or null for no-age-statement whiskies; abv is the alcohol percentage as a number (for example 43 or 54.4).',
    `description is one or two short sentences about the style and character of this whisky, written in ${LANGUAGE_NAMES[language]}. Use null if you have nothing reliable to say.`,
  ].join('\n');
}

const EMPTY_RESULT: RecognizedWhiskey = {
  name: null,
  distillery: null,
  region: null,
  age: null,
  abv: null,
  description: null,
  sources: [],
};

export function isAiRecognitionEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Error with an HTTP status that `handleError` maps to a response. */
export class AiRecognitionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AiRecognitionError';
  }
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanNumber(
  value: unknown,
  min: number,
  max: number,
  integer: boolean,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = integer ? Math.round(value) : Math.round(value * 10) / 10;
  if (normalized < min || normalized > max) return null;
  return normalized;
}

/** Validates and normalizes the model's JSON output field by field. */
export function parseRecognition(
  text: string,
): Omit<RecognizedWhiskey, 'sources'> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ...EMPTY_RESULT };
  }
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_RESULT };
  const data = raw as Record<string, unknown>;
  return {
    name: cleanString(data.name, 200),
    distillery: cleanString(data.distillery, 200),
    region: cleanString(data.region, 100),
    age: cleanNumber(data.age, 1, 100, true),
    abv: cleanNumber(data.abv, 1, 100, false),
    description: cleanString(data.description, 1000),
  };
}

function collectSources(
  content: Anthropic.Beta.BetaContentBlock[],
  into: Set<string>,
): void {
  for (const block of content) {
    if (block.type !== 'web_search_tool_result') continue;
    // A successful search returns a list of results; an error returns an object.
    if (!Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (result.type === 'web_search_result' && result.url) {
        into.add(result.url);
      }
    }
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ timeout: TOTAL_BUDGET_MS, maxRetries: 0 });
  }
  return client;
}

/** Test-only: drop the memoized client. */
export function resetAiClientForTests(): void {
  client = null;
}

export async function recognizeWhiskey(
  image: Buffer,
  mediaType: RecognitionMediaType,
  language: RecognitionLanguage,
): Promise<RecognizedWhiskey> {
  if (!isAiRecognitionEnabled()) {
    throw new AiRecognitionError(503, 'AI recognition is not configured');
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: image.toString('base64'),
          },
        },
        {
          type: 'text',
          text: 'Identify this whisky bottle and fill in the fields.',
        },
      ],
    },
  ];
  const sources = new Set<string>();

  try {
    for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
      const response = await getClient().beta.messages.create(
        {
          model: AI_MODEL,
          max_tokens: 4096,
          system: systemPrompt(language),
          messages,
          tools: [
            {
              type: 'web_search_20260209',
              name: 'web_search',
              max_uses: 3,
              allowed_domains: SEARCH_ALLOWED_DOMAINS,
            },
          ],
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
          },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { timeout: Math.max(deadline - Date.now(), 1_000) },
      );

      collectSources(response.content, sources);

      if (response.stop_reason === 'pause_turn') {
        // A long server-side search turn paused; resume it if time allows.
        if (deadline - Date.now() < MIN_CONTINUATION_BUDGET_MS) break;
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }

      if (response.stop_reason === 'refusal') break;

      const textBlocks = response.content.filter(
        (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
      );
      const last = textBlocks[textBlocks.length - 1];
      if (!last) break;

      return {
        ...parseRecognition(last.text),
        sources: [...sources].slice(0, MAX_SOURCES),
      };
    }
  } catch (error: unknown) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AiRecognitionError(503, 'AI recognition is not configured');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AiRecognitionError(429, 'AI recognition is busy, try again');
    }
    if (error instanceof Anthropic.APIError) {
      console.error('AI recognition failed:', error.status, error.message);
      throw new AiRecognitionError(502, 'AI recognition failed');
    }
    throw error;
  }

  return { ...EMPTY_RESULT, sources: [...sources].slice(0, MAX_SOURCES) };
}
