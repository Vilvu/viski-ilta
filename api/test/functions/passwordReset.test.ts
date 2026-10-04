import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpResponseInit } from '@azure/functions';
import { fakeCosmos } from '../helpers/mockCosmos';
import {
  makeRequest,
  makeContext,
  makePrincipal,
  readJson,
} from '../helpers/request';

vi.mock('../../src/lib/cosmos', () => ({
  getContainer: (name: string) => fakeCosmos.getContainer(name),
}));

import {
  register,
  login,
  getSession,
  changePassword,
} from '../../src/functions/auth';
import { getMe, resetUserPassword, listUsers } from '../../src/functions/users';
import { SESSION_COOKIE, verifySessionToken } from '../../src/lib/session';

const ctx = makeContext();
const ADMIN_ID = 'admin1';
const admin = makePrincipal({ userId: ADMIN_ID });

beforeEach(() => {
  fakeCosmos.reset();
  vi.stubEnv('AUTH_SESSION_SECRET', 'test-secret-value-at-least-32-bytes-long');
  fakeCosmos.seed('users', [
    {
      id: ADMIN_ID,
      displayName: 'Admin',
      email: 'a@x',
      role: 'admin',
      usernameConfirmed: true,
      createdAt: '',
      updatedAt: '',
    },
  ]);
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

const withSession = (token: string, body?: unknown) =>
  makeRequest({ cookies: { [SESSION_COOKIE]: token }, body });

async function registerAlice() {
  const res = await register(
    makeRequest({ body: { username: 'Alice', password: 'original-pass' } }),
    ctx,
  );
  const claims = await verifySessionToken(sessionToken(res));
  return claims!.userId;
}

async function resetAs(
  principal: ReturnType<typeof makePrincipal>,
  id: string,
) {
  return resetUserPassword(makeRequest({ principal, params: { id } }), ctx);
}

async function signIn(username: string, password: string) {
  return login(makeRequest({ body: { username, password } }), ctx);
}

async function credentials() {
  const { resource } = await fakeCosmos
    .getContainer('credentials')
    .item('alice', 'alice')
    .read();
  return resource!;
}

describe('POST /api/users/{id}/reset-password', () => {
  it('issues a temporary password that replaces the old one', async () => {
    const userId = await registerAlice();
    const res = await resetAs(admin, userId);

    const { status, data } = readJson(res) as {
      status: number;
      data: { data: { temporaryPassword: string; expiresAt: string } };
    };
    expect(status).toBe(200);
    const { temporaryPassword, expiresAt } = data.data;
    expect(temporaryPassword).toMatch(/^[A-Za-z2-9]{12}$/);
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(
      23 * 3_600_000,
    );
    expect((res.headers as Record<string, string>)['Cache-Control']).toBe(
      'no-store',
    );

    expect((await signIn('alice', 'original-pass')).status).toBe(401);
    expect((await signIn('alice', temporaryPassword)).status).toBe(200);
    expect(await credentials()).toMatchObject({ mustChangePassword: true });
  });

  it('generates a different password each time', async () => {
    const userId = await registerAlice();
    const first = readJson(await resetAs(admin, userId)).data as {
      data: { temporaryPassword: string };
    };
    const second = readJson(await resetAs(admin, userId)).data as {
      data: { temporaryPassword: string };
    };
    expect(first.data.temporaryPassword).not.toBe(
      second.data.temporaryPassword,
    );
  });

  it('clears an existing lockout', async () => {
    const userId = await registerAlice();
    for (let i = 0; i < 5; i++) await signIn('alice', 'wrong-password');
    expect((await credentials()).lockedUntil).not.toBeNull();

    await resetAs(admin, userId);
    expect(await credentials()).toMatchObject({
      failedAttempts: 0,
      lockedUntil: null,
    });
  });

  it('returns 404 for an Entra ID user (no password to reset)', async () => {
    fakeCosmos.seed('users', [
      {
        id: 'aad-user',
        displayName: 'Bob',
        email: 'b@x',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    expect((await resetAs(admin, 'aad-user')).status).toBe(404);
  });

  it("refuses to reset the admin's own password", async () => {
    expect((await resetAs(admin, ADMIN_ID)).status).toBe(400);
  });

  it('rejects a non-admin caller', async () => {
    const userId = await registerAlice();
    const res = await resetAs(makePrincipal({ userId: 'someone' }), userId);
    expect(res.status).toBe(403);
  });
});

describe('signing in with a temporary password', () => {
  async function aliceWithTempPassword() {
    const userId = await registerAlice();
    const reset = readJson(await resetAs(admin, userId)).data as {
      data: { temporaryPassword: string };
    };
    return { userId, temp: reset.data.temporaryPassword };
  }

  it('returns mustChangePassword and a restricted session', async () => {
    const { temp } = await aliceWithTempPassword();
    const res = await signIn('alice', temp);

    expect(readJson(res).data).toMatchObject({
      data: { mustChangePassword: true },
    });
    const claims = await verifySessionToken(sessionToken(res));
    expect(claims?.mustChangePassword).toBe(true);
  });

  it('blocks the rest of the API until the password is changed', async () => {
    const { temp } = await aliceWithTempPassword();
    const token = sessionToken(await signIn('alice', temp));

    expect((await getMe(withSession(token), ctx)).status).toBe(401);
    expect(
      readJson(await getSession(withSession(token), ctx)).data,
    ).toMatchObject({
      clientPrincipal: { userDetails: 'Alice' },
      mustChangePassword: true,
    });
  });

  it('rejects an expired temporary password', async () => {
    const { temp } = await aliceWithTempPassword();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 25 * 3_600_000);

    const res = await signIn('alice', temp);
    expect(readJson(res)).toMatchObject({
      status: 401,
      data: { message: expect.stringMatching(/expired/i) },
    });
    expect(res.cookies).toBeUndefined();
  });

  it('changing the password lifts the restriction', async () => {
    const { temp } = await aliceWithTempPassword();
    const token = sessionToken(await signIn('alice', temp));

    const res = await changePassword(
      withSession(token, {
        currentPassword: temp,
        newPassword: 'brand-new-pass',
      }),
      ctx,
    );
    expect(res.status).toBe(204);
    const fresh = sessionToken(res);
    expect(
      (await verifySessionToken(fresh))?.mustChangePassword,
    ).toBeUndefined();
    expect((await getMe(withSession(fresh), ctx)).status).toBe(200);

    expect(await credentials()).toMatchObject({
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
    });
    expect((await signIn('alice', temp)).status).toBe(401);
    const again = await signIn('alice', 'brand-new-pass');
    expect(readJson(again).data).toMatchObject({
      data: { mustChangePassword: false },
    });
  });
});

describe('POST /api/auth/change-password', () => {
  async function aliceSession() {
    await registerAlice();
    return sessionToken(await signIn('alice', 'original-pass'));
  }

  it('lets a signed-in user change their own password', async () => {
    const token = await aliceSession();
    const res = await changePassword(
      withSession(token, {
        currentPassword: 'original-pass',
        newPassword: 'another-pass',
      }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect((await signIn('alice', 'another-pass')).status).toBe(200);
  });

  it('requires a session', async () => {
    const res = await changePassword(
      makeRequest({
        body: { currentPassword: 'original-pass', newPassword: 'another-pass' },
      }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it('rejects a wrong current password', async () => {
    const token = await aliceSession();
    const res = await changePassword(
      withSession(token, {
        currentPassword: 'nope',
        newPassword: 'another-pass',
      }),
      ctx,
    );
    expect(readJson(res)).toMatchObject({
      status: 400,
      data: { message: 'Current password is incorrect' },
    });
  });

  it.each([
    ['too short', 'short'],
    ['the same as the current one', 'original-pass'],
  ])('rejects a new password that is %s', async (_label, newPassword) => {
    const token = await aliceSession();
    const res = await changePassword(
      withSession(token, { currentPassword: 'original-pass', newPassword }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing current password', async () => {
    const token = await aliceSession();
    const res = await changePassword(
      withSession(token, { newPassword: 'another-pass' }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('rejects and clears a session whose account no longer exists', async () => {
    const token = await aliceSession();
    await fakeCosmos
      .getContainer('credentials')
      .item('alice', 'alice')
      .delete();
    const res = await changePassword(
      withSession(token, {
        currentPassword: 'original-pass',
        newPassword: 'another-pass',
      }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(res.cookies).toEqual([
      expect.objectContaining({ name: SESSION_COOKIE, maxAge: 0 }),
    ]);
  });
});

describe('GET /api/users includes authProvider', () => {
  it('marks native and Entra ID accounts', async () => {
    await registerAlice();
    const res = await listUsers(makeRequest({ principal: admin }), ctx);
    const users = (
      readJson(res).data as {
        data: { displayName: string; authProvider: string }[];
      }
    ).data;
    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'Alice',
          authProvider: 'local',
          username: 'Alice',
        }),
        expect.objectContaining({ displayName: 'Admin', authProvider: 'aad' }),
      ]),
    );
    const entra = users.find((u) => u.displayName === 'Admin');
    expect(entra).not.toHaveProperty('username');
  });
});

describe('existing sessions', () => {
  it('a reset signs out every existing session of the user', async () => {
    const userId = await registerAlice();
    const before = sessionToken(await signIn('alice', 'original-pass'));
    expect((await getMe(withSession(before), ctx)).status).toBe(200);

    await resetAs(admin, userId);

    expect((await getMe(withSession(before), ctx)).status).toBe(401);
    expect(
      readJson(await getSession(withSession(before), ctx)).data,
    ).toMatchObject({ clientPrincipal: null });
  });

  it('changing the password keeps this session and signs out the others', async () => {
    await registerAlice();
    const laptop = sessionToken(await signIn('alice', 'original-pass'));
    const phone = sessionToken(await signIn('alice', 'original-pass'));

    const res = await changePassword(
      withSession(laptop, {
        currentPassword: 'original-pass',
        newPassword: 'brand-new-pass',
      }),
      ctx,
    );
    const laptopNow = sessionToken(res);

    expect((await getMe(withSession(laptopNow), ctx)).status).toBe(200);
    expect((await getMe(withSession(phone), ctx)).status).toBe(401);
    expect((await getMe(withSession(laptop), ctx)).status).toBe(401);
  });

  it('a revoked session cannot change the password', async () => {
    const userId = await registerAlice();
    const before = sessionToken(await signIn('alice', 'original-pass'));
    await resetAs(admin, userId);

    const res = await changePassword(
      withSession(before, {
        currentPassword: 'original-pass',
        newPassword: 'attacker-pass',
      }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe('change-password has the same protections as sign-in', () => {
  async function aliceSession() {
    await registerAlice();
    return sessionToken(await signIn('alice', 'original-pass'));
  }

  const attempt = (token: string, currentPassword: string) =>
    changePassword(
      withSession(token, { currentPassword, newPassword: 'attacker-pass' }),
      ctx,
    );

  it('rejects an expired temporary password from a still-valid restricted session', async () => {
    const userId = await registerAlice();
    const { temporaryPassword: temp } = (
      readJson(await resetAs(admin, userId)).data as {
        data: { temporaryPassword: string };
      }
    ).data;
    const restricted = sessionToken(await signIn('alice', temp));

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 25 * 3_600_000);

    const res = await changePassword(
      withSession(restricted, {
        currentPassword: temp,
        newPassword: 'brand-new-pass',
      }),
      ctx,
    );
    expect(readJson(res)).toMatchObject({
      status: 401,
      data: { message: expect.stringMatching(/expired/i) },
    });
    expect(res.cookies).toEqual([
      expect.objectContaining({ name: SESSION_COOKIE, maxAge: 0 }),
    ]);
    expect(await credentials()).toMatchObject({ mustChangePassword: true });
    expect((await signIn('alice', 'brand-new-pass')).status).toBe(401);
  });

  it('counts wrong current passwords and locks after 5', async () => {
    const token = await aliceSession();
    for (let i = 1; i <= 4; i++) {
      expect((await attempt(token, `wrong-${i}`)).status).toBe(400);
    }
    expect((await credentials()).failedAttempts).toBe(4);

    expect((await attempt(token, 'wrong-5')).status).toBe(429);
    expect((await credentials()).lockedUntil).not.toBeNull();

    // Even the right password is refused while locked, and nothing changes.
    expect((await attempt(token, 'original-pass')).status).toBe(429);
    expect((await signIn('alice', 'attacker-pass')).status).toBe(429);
  });

  it('shares the lockout with sign-in', async () => {
    const token = await aliceSession();
    for (let i = 0; i < 5; i++) await signIn('alice', 'wrong-password');

    expect((await attempt(token, 'original-pass')).status).toBe(429);
  });

  it('works again once the lockout window has passed', async () => {
    const token = await aliceSession();
    for (let i = 0; i < 5; i++) await attempt(token, `wrong-${i}`);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 16 * 60_000);

    expect((await attempt(token, 'original-pass')).status).toBe(204);
    expect(await credentials()).toMatchObject({
      failedAttempts: 0,
      lockedUntil: null,
    });
  });
});
