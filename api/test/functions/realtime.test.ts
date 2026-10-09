import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  makeRequest,
  makeContext,
  makePrincipal,
  readJson,
} from '../helpers/request';
import { negotiate } from '../../src/functions/realtime';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.AzureSignalRConnectionString;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('negotiate', () => {
  it('returns 401 without a principal', async () => {
    const res = await negotiate(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 503 when SignalR is not configured', async () => {
    const res = await negotiate(
      makeRequest({ principal: makePrincipal() }),
      makeContext(),
    );
    expect(res.status).toBe(503);
  });

  it('returns top-level { url, accessToken } when configured', async () => {
    process.env.AzureSignalRConnectionString =
      'Endpoint=https://whisky.service.signalr.net;AccessKey=k;Version=1.0;';
    const res = await negotiate(
      makeRequest({ principal: makePrincipal({ userId: 'u42' }) }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    const body = data as { url: string; accessToken: string };
    expect(body.url).toBe(
      'https://whisky.service.signalr.net/client/?hub=whisky',
    );
    const payload = JSON.parse(
      Buffer.from(body.accessToken.split('.')[1], 'base64url').toString(),
    );
    expect(payload.sub).toBe('u42');
  });
});
