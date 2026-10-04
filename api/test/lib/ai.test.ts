import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());
const constructorArgs = vi.hoisted(() => [] as unknown[]);

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  const Real = actual.default;
  class FakeAnthropic {
    static APIError = Real.APIError;
    static AuthenticationError = Real.AuthenticationError;
    static RateLimitError = Real.RateLimitError;
    beta = { messages: { create: createMock } };
    constructor(options: unknown) {
      constructorArgs.push(options);
    }
  }
  return { default: FakeAnthropic };
});

import Anthropic from '@anthropic-ai/sdk';
import {
  recognizeWhiskey,
  parseRecognition,
  isAiRecognitionEnabled,
  resetAiClientForTests,
  AI_MODEL,
  SEARCH_ALLOWED_DOMAINS,
} from '../../src/lib/ai';

const IMAGE = Buffer.from([0xff, 0xd8, 0xff]);

function textResponse(text: string, extra: unknown[] = []) {
  return {
    stop_reason: 'end_turn',
    content: [...extra, { type: 'text', text }],
  };
}

const FULL = {
  name: 'Lagavulin 16',
  distillery: 'Lagavulin',
  region: 'Islay',
  age: 16,
  abv: 43,
  description: 'Rich and smoky.',
};

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  createMock.mockReset();
  constructorArgs.length = 0;
  resetAiClientForTests();
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe('isAiRecognitionEnabled', () => {
  it('reflects whether ANTHROPIC_API_KEY is set', () => {
    expect(isAiRecognitionEnabled()).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAiRecognitionEnabled()).toBe(false);
  });
});

describe('recognizeWhiskey request', () => {
  it('sends the image, scoped web search and structured output config', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify(FULL)));

    await recognizeWhiskey(IMAGE, 'image/jpeg', 'fi');

    expect(constructorArgs[0]).toMatchObject({ maxRetries: 0 });
    const [params, options] = createMock.mock.calls[0];
    expect(params.model).toBe(AI_MODEL);
    expect(params.tools).toEqual([
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: 3,
        allowed_domains: SEARCH_ALLOWED_DOMAINS,
      },
    ]);
    expect(params.output_config.effort).toBe('low');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema.required).toEqual([
      'name',
      'distillery',
      'region',
      'age',
      'abv',
      'description',
    ]);
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.system).toContain('Finnish');
    expect(params.messages[0].content[0]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: IMAGE.toString('base64'),
      },
    });
    expect(options.timeout).toBeGreaterThan(0);
  });

  it('throws a 503 error without an API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      recognizeWhiskey(IMAGE, 'image/png', 'en'),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('recognizeWhiskey response handling', () => {
  it('returns parsed fields and collects search sources', async () => {
    createMock.mockResolvedValue(
      textResponse(JSON.stringify({ ...FULL, age: null }), [
        {
          type: 'web_search_tool_result',
          tool_use_id: 't1',
          content: [
            {
              type: 'web_search_result',
              url: 'https://www.whiskybase.com/x',
              title: 'x',
              encrypted_content: '',
              page_age: null,
            },
          ],
        },
        // An errored search returns an object, not a list.
        {
          type: 'web_search_tool_result',
          tool_use_id: 't2',
          content: {
            type: 'web_search_tool_result_error',
            error_code: 'unavailable',
          },
        },
      ]),
    );

    const result = await recognizeWhiskey(IMAGE, 'image/jpeg', 'en');
    expect(result).toEqual({
      ...FULL,
      age: null,
      sources: ['https://www.whiskybase.com/x'],
    });
  });

  it('uses the last text block', async () => {
    createMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [
        { type: 'text', text: 'Searching...' },
        { type: 'text', text: JSON.stringify(FULL) },
      ],
    });
    const result = await recognizeWhiskey(IMAGE, 'image/jpeg', 'en');
    expect(result.name).toBe('Lagavulin 16');
  });

  it('resumes a pause_turn by sending the assistant turn back', async () => {
    const paused = {
      stop_reason: 'pause_turn',
      content: [
        { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
      ],
    };
    createMock
      .mockResolvedValueOnce(paused)
      .mockResolvedValueOnce(textResponse(JSON.stringify(FULL)));

    const result = await recognizeWhiskey(IMAGE, 'image/jpeg', 'en');
    expect(result.name).toBe('Lagavulin 16');
    expect(createMock).toHaveBeenCalledTimes(2);
    const secondMessages = createMock.mock.calls[1][0].messages;
    expect(secondMessages).toHaveLength(2);
    expect(secondMessages[1]).toEqual({
      role: 'assistant',
      content: paused.content,
    });
  });

  it('stops after the maximum number of continuations', async () => {
    createMock.mockResolvedValue({ stop_reason: 'pause_turn', content: [] });
    const result = await recognizeWhiskey(IMAGE, 'image/jpeg', 'en');
    expect(result.name).toBeNull();
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('returns an empty result on refusal', async () => {
    createMock.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const result = await recognizeWhiskey(IMAGE, 'image/jpeg', 'en');
    expect(result).toEqual({
      name: null,
      distillery: null,
      region: null,
      age: null,
      abv: null,
      description: null,
      sources: [],
    });
  });

  it('returns an empty result when there is no text block', async () => {
    createMock.mockResolvedValue({ stop_reason: 'end_turn', content: [] });
    const result = await recognizeWhiskey(IMAGE, 'image/jpeg', 'en');
    expect(result.name).toBeNull();
  });
});

describe('recognizeWhiskey error mapping', () => {
  const headers = new Headers();

  it('maps authentication errors to 503', async () => {
    createMock.mockRejectedValue(
      new Anthropic.AuthenticationError(401, {}, 'bad key', headers),
    );
    await expect(
      recognizeWhiskey(IMAGE, 'image/jpeg', 'en'),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('maps rate limits to 429', async () => {
    createMock.mockRejectedValue(
      new Anthropic.RateLimitError(429, {}, 'slow down', headers),
    );
    await expect(
      recognizeWhiskey(IMAGE, 'image/jpeg', 'en'),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('maps other API errors to 502', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createMock.mockRejectedValue(
      new Anthropic.APIError(500, {}, 'boom', headers),
    );
    await expect(
      recognizeWhiskey(IMAGE, 'image/jpeg', 'en'),
    ).rejects.toMatchObject({ statusCode: 502 });
    errorSpy.mockRestore();
  });

  it('rethrows non-API errors unchanged', async () => {
    const error = new Error('unexpected');
    createMock.mockRejectedValue(error);
    await expect(recognizeWhiskey(IMAGE, 'image/jpeg', 'en')).rejects.toBe(
      error,
    );
  });
});

describe('parseRecognition', () => {
  it('returns all nulls for invalid JSON or non-objects', () => {
    expect(parseRecognition('not json').name).toBeNull();
    expect(parseRecognition('42').name).toBeNull();
  });

  it('drops wrong types, trims strings and normalizes numbers', () => {
    expect(
      parseRecognition(
        JSON.stringify({
          name: '  Talisker 10  ',
          distillery: '',
          region: 7,
          age: 10.4,
          abv: 45.83,
          description: null,
        }),
      ),
    ).toEqual({
      name: 'Talisker 10',
      distillery: null,
      region: null,
      age: 10,
      abv: 45.8,
      description: null,
    });
  });

  it('rejects out-of-range numbers', () => {
    const result = parseRecognition(JSON.stringify({ age: 0, abv: 150 }));
    expect(result.age).toBeNull();
    expect(result.abv).toBeNull();
  });
});
