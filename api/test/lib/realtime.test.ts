import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import {
  parseConnectionString,
  signJwt,
  getClientConnectionInfo,
  getSignalRConfig,
  broadcast,
} from '../../src/lib/realtime';

const KEY = 'test-access-key';
const CS = `Endpoint=https://whisky.service.signalr.net;AccessKey=${KEY};Version=1.0;`;
const ORIGINAL_ENV = { ...process.env };

function decode(token: string) {
  const [header, body, signature] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(body, 'base64url').toString()),
    signature,
    signingInput: `${header}.${body}`,
  };
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.AzureSignalRConnectionString;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseConnectionString', () => {
  it('returns null for empty or missing input', () => {
    expect(parseConnectionString(undefined)).toBeNull();
    expect(parseConnectionString('')).toBeNull();
  });

  it('returns null when Endpoint or AccessKey is missing', () => {
    expect(parseConnectionString('Endpoint=https://x;Version=1.0;')).toBeNull();
    expect(parseConnectionString('AccessKey=abc;Version=1.0;')).toBeNull();
  });

  it('parses endpoint and key, trimming a trailing slash', () => {
    expect(
      parseConnectionString(
        'Endpoint=https://x.service.signalr.net/;AccessKey=a=b==;Version=1.0;',
      ),
    ).toEqual({
      endpoint: 'https://x.service.signalr.net',
      accessKey: 'a=b==',
    });
  });

  it('appends Port when given (local emulator format)', () => {
    expect(
      parseConnectionString(
        'Endpoint=http://localhost;Port=8888;AccessKey=k;Version=1.0;',
      ),
    ).toEqual({ endpoint: 'http://localhost:8888', accessKey: 'k' });
  });

  it('getSignalRConfig reads AzureSignalRConnectionString', () => {
    expect(getSignalRConfig()).toBeNull();
    process.env.AzureSignalRConnectionString = CS;
    expect(getSignalRConfig()?.endpoint).toBe(
      'https://whisky.service.signalr.net',
    );
  });
});

describe('signJwt', () => {
  it('produces an HS256 token verifiable with the key', () => {
    const token = signJwt({ aud: 'a', sub: 'b' }, KEY);
    const { header, payload, signature, signingInput } = decode(token);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toEqual({ aud: 'a', sub: 'b' });
    expect(signature).toBe(
      createHmac('sha256', KEY).update(signingInput).digest('base64url'),
    );
  });
});

describe('getClientConnectionInfo', () => {
  it('returns the client hub url and a token scoped to it', () => {
    const config = parseConnectionString(CS)!;
    const before = Math.floor(Date.now() / 1000);
    const info = getClientConnectionInfo(config, 'user1');
    expect(info.url).toBe(
      'https://whisky.service.signalr.net/client/?hub=whisky',
    );
    const { payload } = decode(info.accessToken);
    expect(payload.aud).toBe(info.url);
    expect(payload.sub).toBe('user1');
    expect(payload.exp).toBeGreaterThanOrEqual(before + 3600);
  });
});

describe('broadcast', () => {
  it('is a no-op when SignalR is not configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await broadcast('eventsChanged', { eventId: 'e1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the message to the hub REST endpoint with a bearer token', async () => {
    process.env.AzureSignalRConnectionString = CS;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchMock);

    await broadcast('ratingsChanged', { eventId: 'e1', whiskeyId: 'w1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://whisky.service.signalr.net/api/v1/hubs/whisky');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      target: 'ratingsChanged',
      arguments: [{ eventId: 'e1', whiskeyId: 'w1' }],
    });
    const token = init.headers.Authorization.replace('Bearer ', '');
    expect(decode(token).payload.aud).toBe(url);
  });

  it('swallows non-2xx responses', async () => {
    process.env.AzureSignalRConnectionString = CS;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    await expect(broadcast('catalogChanged', {})).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('swallows network errors', async () => {
    process.env.AzureSignalRConnectionString = CS;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(broadcast('catalogChanged', {})).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
