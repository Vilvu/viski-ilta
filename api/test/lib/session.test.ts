import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';
import { makeRequest } from '../helpers/request';
import {
  createSessionToken,
  verifySessionToken,
  getSessionPrincipal,
  sessionCookie,
  clearedSessionCookie,
  isSessionConfigured,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '../../src/lib/session';

const SECRET = 'test-secret-value';

beforeEach(() => {
  vi.stubEnv('AUTH_SESSION_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('session tokens', () => {
  it('round-trips the user id and username', async () => {
    const token = await createSessionToken({
      userId: 'local:1',
      username: 'Alice',
    });
    await expect(verifySessionToken(token)).resolves.toEqual({
      userId: 'local:1',
      username: 'Alice',
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken({
      userId: 'local:1',
      username: 'a',
    });
    vi.stubEnv('AUTH_SESSION_SECRET', 'another-secret');
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await createSessionToken({
      userId: 'local:1',
      username: 'a',
    });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'local:admin', name: 'admin', iss: 'whisky-app' }),
    ).toString('base64url');
    await expect(
      verifySessionToken(`${header}.${forgedPayload}.${signature}`),
    ).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await new SignJWT({ name: 'a' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('local:1')
      .setIssuer('whisky-app')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it('fails closed when the secret is not configured', async () => {
    const token = await createSessionToken({
      userId: 'local:1',
      username: 'a',
    });
    vi.stubEnv('AUTH_SESSION_SECRET', '');
    expect(isSessionConfigured()).toBe(false);
    await expect(verifySessionToken(token)).resolves.toBeNull();
    await expect(
      createSessionToken({ userId: 'local:1', username: 'a' }),
    ).rejects.toThrow();
  });
});

describe('getSessionPrincipal', () => {
  it('returns null without a cookie header', async () => {
    await expect(getSessionPrincipal(makeRequest())).resolves.toBeNull();
  });

  it('returns null when the session cookie is absent', async () => {
    const req = makeRequest({ cookies: { other: 'x' } });
    await expect(getSessionPrincipal(req)).resolves.toBeNull();
  });

  it('builds a local ClientPrincipal from a valid cookie', async () => {
    const token = await createSessionToken({
      userId: 'local:1',
      username: 'Alice',
    });
    const req = makeRequest({ cookies: { [SESSION_COOKIE]: token } });
    await expect(getSessionPrincipal(req)).resolves.toEqual({
      userId: 'local:1',
      userRoles: ['anonymous', 'authenticated'],
      claims: [{ typ: 'name', val: 'Alice' }],
      identityProvider: 'local',
      userDetails: 'Alice',
    });
  });
});

describe('session cookies', () => {
  it('sets a hardened cookie', () => {
    expect(sessionCookie('tok')).toMatchObject({
      name: SESSION_COOKIE,
      value: 'tok',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  });

  it('clears the cookie with maxAge 0', () => {
    expect(clearedSessionCookie()).toMatchObject({
      name: SESSION_COOKIE,
      value: '',
      maxAge: 0,
    });
  });
});
