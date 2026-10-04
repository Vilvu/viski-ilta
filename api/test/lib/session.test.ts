import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';
import { fakeCosmos } from '../helpers/mockCosmos';
import { makeRequest } from '../helpers/request';

vi.mock('../../src/lib/cosmos', () => ({
  getContainer: (name: string) => fakeCosmos.getContainer(name),
}));

import {
  createSessionToken,
  verifySessionToken,
  getSessionPrincipal,
  readSession,
  sessionCookie,
  clearedSessionCookie,
  isSessionConfigured,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '../../src/lib/session';

const SECRET = 'test-secret-value';

function seedCredentials(sessionVersion = 0, userId = 'local:1') {
  fakeCosmos.seed('credentials', [
    {
      id: 'alice',
      username: 'Alice',
      userId,
      passwordHash: 'hash',
      failedAttempts: 0,
      lockedUntil: null,
      sessionVersion,
    },
  ]);
}

beforeEach(() => {
  fakeCosmos.reset();
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
      sessionVersion: 0,
    });
  });

  it('round-trips the must-change-password flag', async () => {
    const token = await createSessionToken({
      userId: 'local:1',
      username: 'Alice',
      mustChangePassword: true,
    });
    await expect(verifySessionToken(token)).resolves.toEqual({
      userId: 'local:1',
      username: 'Alice',
      sessionVersion: 0,
      mustChangePassword: true,
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
    seedCredentials();
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

describe('restricted (must-change-password) sessions', () => {
  it('readSession returns them but getSessionPrincipal does not', async () => {
    seedCredentials();
    const token = await createSessionToken({
      userId: 'local:1',
      username: 'Alice',
      mustChangePassword: true,
    });
    const req = makeRequest({ cookies: { [SESSION_COOKIE]: token } });
    await expect(readSession(req)).resolves.toMatchObject({
      mustChangePassword: true,
    });
    await expect(getSessionPrincipal(req)).resolves.toBeNull();
  });
});

describe('session revocation', () => {
  async function aliceRequest(sessionVersion?: number) {
    const token = await createSessionToken({
      userId: 'local:1',
      username: 'Alice',
      sessionVersion,
    });
    return makeRequest({ cookies: { [SESSION_COOKIE]: token } });
  }

  it('accepts a session issued at the current version', async () => {
    seedCredentials(3);
    await expect(readSession(await aliceRequest(3))).resolves.toMatchObject({
      sessionVersion: 3,
    });
  });

  it('rejects a session issued before a password reset/change', async () => {
    seedCredentials(1);
    await expect(readSession(await aliceRequest(0))).resolves.toBeNull();
    await expect(
      getSessionPrincipal(await aliceRequest(0)),
    ).resolves.toBeNull();
  });

  it('rejects a session whose credentials were deleted', async () => {
    await expect(readSession(await aliceRequest())).resolves.toBeNull();
  });

  it('rejects a session when the username now belongs to someone else', async () => {
    seedCredentials(0, 'local:someone-else');
    await expect(readSession(await aliceRequest())).resolves.toBeNull();
  });

  it('treats tokens and credentials without a version as version 0', async () => {
    fakeCosmos.seed('credentials', [
      { id: 'alice', username: 'Alice', userId: 'local:1', passwordHash: 'h' },
    ]);
    const legacy = await new SignJWT({ name: 'Alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('local:1')
      .setIssuer('whisky-app')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    const req = makeRequest({ cookies: { [SESSION_COOKIE]: legacy } });
    await expect(getSessionPrincipal(req)).resolves.toMatchObject({
      userId: 'local:1',
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
