import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeCosmos } from '../helpers/mockCosmos';
import {
  makeRequest,
  makePrincipal,
  principalHeader,
} from '../helpers/request';
import type { ClientPrincipal } from '../../src/lib/auth';

vi.mock('../../src/lib/cosmos', () => ({
  getContainer: (name: string) => fakeCosmos.getContainer(name),
}));

import {
  getClientPrincipal,
  requireAuth,
  getUserEmail,
  ensureUser,
  requireTaster,
  requireAdmin,
  isAdmin,
} from '../../src/lib/auth';

beforeEach(() => {
  fakeCosmos.reset();
});

describe('getClientPrincipal', () => {
  it('returns null when the header is missing', () => {
    const req = makeRequest();
    expect(getClientPrincipal(req)).toBeNull();
  });

  it('returns null for malformed base64', () => {
    const req = makeRequest({
      headers: { 'x-ms-client-principal': '***not-base64***' },
    });
    // Buffer.from tolerates most garbage but JSON.parse of the decoded
    // garbage should fail, so this still resolves to null.
    expect(getClientPrincipal(req)).toBeNull();
  });

  it('returns null for valid base64 that is not JSON', () => {
    const header = Buffer.from('not json', 'utf-8').toString('base64');
    const req = makeRequest({ headers: { 'x-ms-client-principal': header } });
    expect(getClientPrincipal(req)).toBeNull();
  });

  it('returns the parsed principal for a valid header', () => {
    const principal = makePrincipal({ userId: 'abc' });
    const req = makeRequest({ principal });
    expect(getClientPrincipal(req)).toEqual(principal);
  });
});

describe('requireAuth', () => {
  it('throws a 401-shaped error when unauthenticated', () => {
    const req = makeRequest();
    expect(() => requireAuth(req)).toThrow();
    try {
      requireAuth(req);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 401 });
    }
  });

  it('returns the principal when authenticated', () => {
    const principal = makePrincipal();
    const req = makeRequest({ principal });
    expect(requireAuth(req)).toEqual(principal);
  });
});

describe('getUserEmail priority', () => {
  const build = (typ: string, val: string): ClientPrincipal =>
    makePrincipal({
      claims: [{ typ, val }],
      userDetails: 'fallback@example.com',
    });

  it('prefers preferred_username over everything else', () => {
    const principal = makePrincipal({
      claims: [
        { typ: 'upn', val: 'upn@example.com' },
        { typ: 'preferred_username', val: 'preferred@example.com' },
      ],
    });
    expect(getUserEmail(principal)).toBe('preferred@example.com');
  });

  it('falls back to upn when preferred_username is absent', () => {
    expect(getUserEmail(build('upn', 'upn@example.com'))).toBe(
      'upn@example.com',
    );
  });

  it('falls back to emails when upn is absent', () => {
    expect(getUserEmail(build('emails', 'emails@example.com'))).toBe(
      'emails@example.com',
    );
  });

  it('falls back to email when emails is absent', () => {
    expect(getUserEmail(build('email', 'email@example.com'))).toBe(
      'email@example.com',
    );
  });

  it('falls back to userDetails when no claim matches', () => {
    const principal = makePrincipal({
      claims: [],
      userDetails: 'details@example.com',
    });
    expect(getUserEmail(principal)).toBe('details@example.com');
  });
});

describe('ensureUser', () => {
  it('creates a doc with role anonymous and usernameConfirmed false on first sign-in', async () => {
    const principal = makePrincipal({ userId: 'new-user' });
    const profile = await ensureUser(principal);
    expect(profile.role).toBe('anonymous');
    expect(profile.usernameConfirmed).toBe(false);
    expect(profile.id).toBe('new-user');
  });

  it('falls back to reading the existing doc on a 409 conflict', async () => {
    const principal = makePrincipal({ userId: 'race-user' });
    const container = fakeCosmos.getContainer('users');
    const createSpy = vi
      .spyOn(container.items, 'create')
      .mockRejectedValueOnce(
        Object.assign(new Error('conflict'), { code: 409 }),
      );
    // Seed the doc that "won the race" so the fallback read finds it.
    fakeCosmos.seed('users', [
      {
        id: 'race-user',
        displayName: 'Race Winner',
        email: 'race@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);
    const profile = await ensureUser(principal);
    expect(profile.role).toBe('taster');
    expect(profile.displayName).toBe('Race Winner');
    createSpy.mockRestore();
  });

  it('backfills email, role, and usernameConfirmed on legacy docs', async () => {
    fakeCosmos.seed('users', [
      {
        id: 'legacy-user',
        displayName: 'Legacy',
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      } as never,
    ]);
    const principal = makePrincipal({
      userId: 'legacy-user',
      claims: [{ typ: 'email', val: 'legacy@example.com' }],
    });
    const profile = await ensureUser(principal);
    expect(profile.email).toBe('legacy@example.com');
    expect(profile.role).toBe('anonymous');
    expect(profile.usernameConfirmed).toBe(false);
  });

  it('retries the backfill write on a 412 precondition failure without failing the request', async () => {
    fakeCosmos.seed('users', [
      {
        id: 'contested-user',
        displayName: 'Contested',
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      } as never,
    ]);
    const usersContainer = fakeCosmos.getContainer('users');
    const replaceSpy = vi
      .spyOn(usersContainer.item('contested-user', 'contested-user'), 'replace')
      .mockRejectedValueOnce(
        Object.assign(new Error('Precondition Failed'), { code: 412 }),
      );
    const principal = makePrincipal({ userId: 'contested-user' });
    const profile = await ensureUser(principal);
    expect(profile.id).toBe('contested-user');
    replaceSpy.mockRestore();
  });

  it('returns the doc unchanged when no backfill is needed', async () => {
    fakeCosmos.seed('users', [
      {
        id: 'complete-user',
        displayName: 'Complete',
        email: 'complete@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      },
    ]);
    const principal = makePrincipal({ userId: 'complete-user' });
    const profile = await ensureUser(principal);
    expect(profile).toMatchObject({
      role: 'taster',
      usernameConfirmed: true,
      email: 'complete@example.com',
    });
  });
});

describe('requireTaster', () => {
  it('rejects an anonymous-role user with 403', async () => {
    const principal = makePrincipal({ userId: 'anon-user' });
    const req = makeRequest({ principal });
    await expect(requireTaster(req)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows a taster-role user', async () => {
    fakeCosmos.seed('users', [
      {
        id: 'taster-user',
        displayName: 'Taster',
        email: 't@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      },
    ]);
    const principal = makePrincipal({ userId: 'taster-user' });
    const req = makeRequest({ principal });
    const { profile } = await requireTaster(req);
    expect(profile.role).toBe('taster');
  });

  it('allows an admin-role user (admin implies taster)', async () => {
    fakeCosmos.seed('users', [
      {
        id: 'admin-user',
        displayName: 'Admin',
        email: 'a@example.com',
        role: 'admin',
        usernameConfirmed: true,
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      },
    ]);
    const principal = makePrincipal({ userId: 'admin-user' });
    const req = makeRequest({ principal });
    const { profile } = await requireTaster(req);
    expect(profile.role).toBe('admin');
  });
});

describe('requireAdmin', () => {
  it('rejects a taster-role user with 403', async () => {
    fakeCosmos.seed('users', [
      {
        id: 'taster-only',
        displayName: 'Taster',
        email: 't2@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      },
    ]);
    const principal = makePrincipal({ userId: 'taster-only' });
    const req = makeRequest({ principal });
    await expect(requireAdmin(req)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows an admin-role user', async () => {
    fakeCosmos.seed('users', [
      {
        id: 'admin-only',
        displayName: 'Admin',
        email: 'a2@example.com',
        role: 'admin',
        usernameConfirmed: true,
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      },
    ]);
    const principal = makePrincipal({ userId: 'admin-only' });
    const req = makeRequest({ principal });
    const { profile } = await requireAdmin(req);
    expect(profile.role).toBe('admin');
  });
});

describe('isAdmin', () => {
  it('resolves true only for admin role', async () => {
    fakeCosmos.seed('users', [
      {
        id: 'is-admin',
        displayName: 'Admin',
        email: 'a3@example.com',
        role: 'admin',
        usernameConfirmed: true,
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      },
      {
        id: 'is-taster',
        displayName: 'Taster',
        email: 't3@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      },
    ]);
    expect(await isAdmin(makePrincipal({ userId: 'is-admin' }))).toBe(true);
    expect(await isAdmin(makePrincipal({ userId: 'is-taster' }))).toBe(false);
  });
});

describe('principalHeader', () => {
  it('round-trips through getClientPrincipal', () => {
    const principal = makePrincipal({ userId: 'round-trip' });
    const header = principalHeader(principal);
    const req = makeRequest({ headers: { 'x-ms-client-principal': header } });
    expect(getClientPrincipal(req)).toEqual(principal);
  });
});
