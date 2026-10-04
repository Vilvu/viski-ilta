import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpResponseInit } from '@azure/functions';
import { fakeCosmos } from '../helpers/mockCosmos';
import { makeRequest, makeContext, readJson } from '../helpers/request';

vi.mock('../../src/lib/cosmos', () => ({
  getContainer: (name: string) => fakeCosmos.getContainer(name),
}));

import {
  register,
  login,
  logout,
  getSession,
  MAX_FAILED_ATTEMPTS,
} from '../../src/functions/auth';
import { getMe } from '../../src/functions/users';
import { SESSION_COOKIE, verifySessionToken } from '../../src/lib/session';

const ctx = makeContext();

beforeEach(() => {
  fakeCosmos.reset();
  vi.stubEnv('AUTH_SESSION_SECRET', 'test-secret-value');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function sessionToken(res: HttpResponseInit): string {
  const cookie = res.cookies?.find((c) => c.name === SESSION_COOKIE);
  expect(cookie).toBeDefined();
  return cookie!.value;
}

async function registerUser(username = 'Alice', password = 'correct-horse') {
  return register(makeRequest({ body: { username, password } }), ctx);
}

describe('POST /api/auth/register', () => {
  it('creates credentials and an anonymous profile, and starts a session', async () => {
    const res = await registerUser();
    expect(readJson(res)).toEqual({
      status: 201,
      data: {
        data: {
          displayName: 'Alice',
          email: '',
          role: 'anonymous',
          usernameConfirmed: true,
        },
      },
    });

    const claims = await verifySessionToken(sessionToken(res));
    expect(claims?.username).toBe('Alice');
    expect(claims?.userId).toMatch(/^local:/);

    const { resource: creds } = await fakeCosmos
      .getContainer('credentials')
      .item('alice', 'alice')
      .read();
    expect(creds?.userId).toBe(claims?.userId);
    expect(creds?.passwordHash).not.toContain('correct-horse');

    const { resource: user } = await fakeCosmos
      .getContainer('users')
      .item(claims!.userId, claims!.userId)
      .read();
    expect(user).toMatchObject({ role: 'anonymous', authProvider: 'local' });
  });

  it('rejects a username that differs only by case', async () => {
    await registerUser('Alice');
    const res = await registerUser('ALICE');
    expect(res.status).toBe(409);
    expect(res.cookies).toBeUndefined();
  });

  it.each([
    ['too short', 'ab'],
    ['invalid characters', 'bad name!'],
    ['too long', 'a'.repeat(33)],
    ['not a string', 42],
  ])('rejects a username that is %s', async (_label, username) => {
    const res = await register(
      makeRequest({ body: { username, password: 'correct-horse' } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it.each([
    ['too short', 'short'],
    ['over 72 bytes', 'ä'.repeat(37)],
    ['missing', undefined],
  ])('rejects a password that is %s', async (_label, password) => {
    const res = await register(
      makeRequest({ body: { username: 'Alice', password } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('rolls back the credentials if the profile cannot be created', async () => {
    vi.spyOn(
      fakeCosmos.getContainer('users').items,
      'create',
    ).mockRejectedValueOnce(new Error('boom'));
    const res = await registerUser();
    expect(res.status).toBe(500);
    const { resource } = await fakeCosmos
      .getContainer('credentials')
      .item('alice', 'alice')
      .read();
    expect(resource).toBeUndefined();
  });

  it('returns 500 when the session secret is not configured', async () => {
    vi.stubEnv('AUTH_SESSION_SECRET', '');
    const res = await registerUser();
    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/login', () => {
  async function attempt(username: string, password: string) {
    return login(makeRequest({ body: { username, password } }), ctx);
  }

  it('signs in with the right password, case-insensitively', async () => {
    await registerUser('Alice', 'correct-horse');
    const res = await attempt('alice', 'correct-horse');
    expect(res.status).toBe(200);
    const claims = await verifySessionToken(sessionToken(res));
    expect(claims?.username).toBe('Alice');
  });

  it('returns a generic 401 for a wrong password', async () => {
    await registerUser();
    const res = await attempt('Alice', 'wrong-password');
    expect(readJson(res)).toMatchObject({
      status: 401,
      data: { message: 'Invalid username or password' },
    });
    expect(res.cookies).toBeUndefined();
  });

  it('returns the same generic 401 for an unknown user', async () => {
    const res = await attempt('nobody', 'whatever-pass');
    expect(readJson(res)).toMatchObject({
      status: 401,
      data: { message: 'Invalid username or password' },
    });
  });

  it('rejects a request missing credentials', async () => {
    const res = await login(makeRequest({ body: {} }), ctx);
    expect(res.status).toBe(400);
  });

  it(`locks the account after ${MAX_FAILED_ATTEMPTS} failures, then unlocks after the window`, async () => {
    await registerUser();
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      expect((await attempt('Alice', 'wrong-password')).status).toBe(401);
    }
    expect((await attempt('Alice', 'wrong-password')).status).toBe(429);
    // Even the right password is refused while locked.
    expect((await attempt('Alice', 'correct-horse')).status).toBe(429);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 16 * 60_000);
    expect((await attempt('Alice', 'correct-horse')).status).toBe(200);
  });

  it('resets the failure counter on a successful sign-in', async () => {
    await registerUser();
    await attempt('Alice', 'wrong-password');
    await attempt('Alice', 'correct-horse');
    const { resource } = await fakeCosmos
      .getContainer('credentials')
      .item('alice', 'alice')
      .read();
    expect(resource).toMatchObject({ failedAttempts: 0, lockedUntil: null });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await logout(makeRequest(), ctx);
    expect(res.status).toBe(204);
    expect(res.cookies).toEqual([
      expect.objectContaining({ name: SESSION_COOKIE, value: '', maxAge: 0 }),
    ]);
  });
});

describe('GET /api/auth/me', () => {
  it('returns a null principal without a session', async () => {
    const res = await getSession(makeRequest(), ctx);
    expect(readJson(res)).toEqual({
      status: 200,
      data: { clientPrincipal: null, mustChangePassword: false },
    });
  });

  it('returns the local principal for a valid session', async () => {
    const token = sessionToken(await registerUser());
    const res = await getSession(
      makeRequest({ cookies: { [SESSION_COOKIE]: token } }),
      ctx,
    );
    expect(readJson(res).data).toMatchObject({
      clientPrincipal: { identityProvider: 'local', userDetails: 'Alice' },
    });
  });

  it('authenticates existing endpoints through the session cookie', async () => {
    const token = sessionToken(await registerUser());
    const res = await getMe(
      makeRequest({ cookies: { [SESSION_COOKIE]: token } }),
      ctx,
    );
    expect(readJson(res)).toMatchObject({
      status: 200,
      data: { data: { displayName: 'Alice', role: 'anonymous' } },
    });
  });
});

describe('removed native accounts', () => {
  async function removeProfile(token: string) {
    const claims = await verifySessionToken(token);
    await fakeCosmos
      .getContainer('users')
      .item(claims!.userId, claims!.userId)
      .delete();
  }

  it('GET /api/auth/me reports a removed account as signed out and clears the cookie', async () => {
    const token = sessionToken(await registerUser());
    await removeProfile(token);

    const res = await getSession(
      makeRequest({ cookies: { [SESSION_COOKIE]: token } }),
      ctx,
    );
    expect(readJson(res).data).toEqual({
      clientPrincipal: null,
      mustChangePassword: false,
    });
    expect(res.cookies).toEqual([
      expect.objectContaining({ name: SESSION_COOKIE, value: '', maxAge: 0 }),
    ]);
  });

  it('does not re-create the profile from a still-valid session', async () => {
    const token = sessionToken(await registerUser());
    await removeProfile(token);

    const res = await getMe(
      makeRequest({ cookies: { [SESSION_COOKIE]: token } }),
      ctx,
    );
    expect(res.status).toBe(401);
    const { resources } = await fakeCosmos
      .getContainer('users')
      .items.query('SELECT * FROM c')
      .fetchAll();
    expect(resources).toHaveLength(0);
  });
});
