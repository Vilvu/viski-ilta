import { createHmac } from 'crypto';

/**
 * Real-time notifications via Azure SignalR Service (Serverless mode).
 *
 * SWA managed functions only support HTTP triggers, so instead of the SignalR
 * Functions bindings we talk to the SignalR Service REST API directly, signing
 * short-lived HS256 JWTs with the access key from the connection string.
 *
 * Messages are invalidation hints only (ids, never data): clients refetch via
 * the normal authenticated REST API. When `AzureSignalRConnectionString` is
 * unset (local dev, tests) every function here degrades to a no-op.
 */

export const HUB = 'whisky';

export interface RealtimePayloads {
  ratingsChanged: { eventId: string; whiskeyId: string };
  eventWhiskeysChanged: { eventId: string; whiskeyId?: string };
  eventsChanged: { eventId?: string };
  catalogChanged: { whiskeyId?: string };
}

export type RealtimeEvent = keyof RealtimePayloads;

export interface SignalRConfig {
  endpoint: string;
  accessKey: string;
}

const CLIENT_TOKEN_TTL_SECONDS = 60 * 60;
const SERVER_TOKEN_TTL_SECONDS = 60;
const BROADCAST_TIMEOUT_MS = 2000;

/**
 * Parses `Endpoint=https://x.service.signalr.net;AccessKey=...;Version=1.0;`.
 * Returns null when the string is empty or missing Endpoint/AccessKey.
 */
export function parseConnectionString(
  connectionString: string | undefined,
): SignalRConfig | null {
  if (!connectionString) return null;

  const parts = new Map<string, string>();
  for (const segment of connectionString.split(';')) {
    const idx = segment.indexOf('=');
    if (idx <= 0) continue;
    parts.set(
      segment.slice(0, idx).trim().toLowerCase(),
      segment.slice(idx + 1).trim(),
    );
  }

  const endpoint = parts.get('endpoint');
  const accessKey = parts.get('accesskey');
  if (!endpoint || !accessKey) return null;

  // The local emulator and self-hosted setups may specify a separate port.
  const port = parts.get('port');
  const base = endpoint.replace(/\/+$/, '');
  return { endpoint: port ? `${base}:${port}` : base, accessKey };
}

export function getSignalRConfig(): SignalRConfig | null {
  return parseConnectionString(process.env.AzureSignalRConnectionString);
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** Minimal HS256 JWT, as accepted by Azure SignalR Service. */
export function signJwt(payload: Record<string, unknown>, key: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', key)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Connection info returned by the negotiate endpoint. The @microsoft/signalr
 * client follows `url` and authenticates with `accessToken`.
 */
export function getClientConnectionInfo(
  config: SignalRConfig,
  userId: string,
): { url: string; accessToken: string } {
  const url = `${config.endpoint}/client/?hub=${HUB}`;
  const accessToken = signJwt(
    { aud: url, sub: userId, exp: nowSeconds() + CLIENT_TOKEN_TTL_SECONDS },
    config.accessKey,
  );
  return { url, accessToken };
}

/**
 * Broadcasts an invalidation hint to every connected client.
 * Never throws: a failed broadcast must not fail the mutation that caused it.
 */
export async function broadcast<T extends RealtimeEvent>(
  target: T,
  payload: RealtimePayloads[T],
): Promise<void> {
  const config = getSignalRConfig();
  if (!config) return;

  const url = `${config.endpoint}/api/v1/hubs/${HUB}`;
  const token = signJwt(
    { aud: url, exp: nowSeconds() + SERVER_TOKEN_TTL_SECONDS },
    config.accessKey,
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target, arguments: [payload] }),
      signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(
        `SignalR broadcast '${target}' failed with status ${response.status}`,
      );
    }
  } catch (error) {
    console.warn(`SignalR broadcast '${target}' failed:`, error);
  }
}
