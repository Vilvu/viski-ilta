import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  getMe,
  updateMe,
  listUsers,
  setUserRole,
  deleteUser,
} from '../../src/functions/users';

const TASTER_ID = 'taster1';
const ADMIN_ID = 'admin1';
const OTHER_ADMIN_ID = 'admin2';

beforeEach(() => {
  fakeCosmos.reset();
});

describe('GET /users/me', () => {
  it('creates the profile on first call', async () => {
    const res = await getMe(
      makeRequest({ principal: makePrincipal({ userId: 'brand-new' }) }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { data: { role: string } }).data.role).toBe('anonymous');
  });

  it('requires authentication', async () => {
    const res = await getMe(makeRequest(), makeContext());
    expect(readJson(res).status).toBe(401);
  });
});

describe('PUT /users/me validation', () => {
  const principal = makePrincipal({ userId: TASTER_ID });

  beforeEach(() => {
    fakeCosmos.seed('users', [
      {
        id: TASTER_ID,
        displayName: 'Old Name',
        email: 't@example.com',
        role: 'taster',
        usernameConfirmed: false,
        createdAt: '',
        updatedAt: '',
      },
    ]);
  });

  it('rejects empty string', async () => {
    const res = await updateMe(
      makeRequest({ principal, body: { displayName: '' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('rejects whitespace-only', async () => {
    const res = await updateMe(
      makeRequest({ principal, body: { displayName: '    ' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('rejects 51 characters', async () => {
    const res = await updateMe(
      makeRequest({ principal, body: { displayName: 'a'.repeat(51) } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('accepts exactly 50 characters', async () => {
    const res = await updateMe(
      makeRequest({ principal, body: { displayName: 'a'.repeat(50) } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(200);
  });

  it('rejects control characters', async () => {
    const res = await updateMe(
      makeRequest({ principal, body: { displayName: 'bad\x00name' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('sets usernameConfirmed true via a set patch on a valid name', async () => {
    const res = await updateMe(
      makeRequest({ principal, body: { displayName: 'New Name' } }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect(
      (data as { data: { displayName: string; usernameConfirmed: boolean } })
        .data,
    ).toMatchObject({
      displayName: 'New Name',
      usernameConfirmed: true,
    });
  });
});

describe('GET /users (admin-only)', () => {
  beforeEach(() => {
    fakeCosmos.seed('users', [
      {
        id: TASTER_ID,
        displayName: 'Taster',
        email: 't@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: ADMIN_ID,
        displayName: 'Admin',
        email: 'a@example.com',
        role: 'admin',
        usernameConfirmed: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);
  });

  it('rejects a non-admin caller', async () => {
    const res = await listUsers(
      makeRequest({ principal: makePrincipal({ userId: TASTER_ID }) }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(403);
  });

  it('lists all users for an admin caller', async () => {
    const res = await listUsers(
      makeRequest({ principal: makePrincipal({ userId: ADMIN_ID }) }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { data: unknown[] }).data).toHaveLength(2);
  });
});

describe('PUT /users/{id}/role', () => {
  beforeEach(() => {
    fakeCosmos.seed('users', [
      {
        id: TASTER_ID,
        displayName: 'Taster',
        email: 't@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: ADMIN_ID,
        displayName: 'Admin',
        email: 'a@example.com',
        role: 'admin',
        usernameConfirmed: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: OTHER_ADMIN_ID,
        displayName: 'Admin Two',
        email: 'a2@example.com',
        role: 'admin',
        usernameConfirmed: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);
  });

  const admin = makePrincipal({ userId: ADMIN_ID });

  it('rejects an invalid role', async () => {
    const res = await setUserRole(
      makeRequest({
        params: { id: TASTER_ID },
        principal: admin,
        body: { role: 'superuser' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('blocks self-demotion', async () => {
    const res = await setUserRole(
      makeRequest({
        params: { id: ADMIN_ID },
        principal: admin,
        body: { role: 'taster' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('blocks demoting the last remaining admin', async () => {
    // Demote OTHER_ADMIN_ID first, leaving ADMIN_ID as the sole admin.
    const first = await setUserRole(
      makeRequest({
        params: { id: OTHER_ADMIN_ID },
        principal: admin,
        body: { role: 'taster' },
      }),
      makeContext(),
    );
    expect(readJson(first).status).toBe(200);

    const res = await setUserRole(
      makeRequest({
        params: { id: ADMIN_ID },
        principal: admin,
        body: { role: 'taster' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('succeeds for a normal promotion', async () => {
    const res = await setUserRole(
      makeRequest({
        params: { id: TASTER_ID },
        principal: admin,
        body: { role: 'admin' },
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { data: { role: string } }).data.role).toBe('admin');
  });

  it('retries and succeeds after a single 412 precondition failure', async () => {
    const usersContainer = fakeCosmos.getContainer('users');
    const replaceSpy = vi
      .spyOn(usersContainer.item(TASTER_ID, TASTER_ID), 'replace')
      .mockRejectedValueOnce(
        Object.assign(new Error('Precondition Failed'), { code: 412 }),
      );

    const res = await setUserRole(
      makeRequest({
        params: { id: TASTER_ID },
        principal: admin,
        body: { role: 'admin' },
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { data: { role: string } }).data.role).toBe('admin');
    expect(replaceSpy).toHaveBeenCalledTimes(2);
    replaceSpy.mockRestore();
  });

  it('gives up after exhausting retries with a sane error status', async () => {
    const usersContainer = fakeCosmos.getContainer('users');
    const replaceSpy = vi
      .spyOn(usersContainer.item(TASTER_ID, TASTER_ID), 'replace')
      .mockRejectedValue(
        Object.assign(new Error('Precondition Failed'), { code: 412 }),
      );

    const res = await setUserRole(
      makeRequest({
        params: { id: TASTER_ID },
        principal: admin,
        body: { role: 'admin' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(500);
    replaceSpy.mockRestore();
  });
});

describe('DELETE /users/{id}', () => {
  const LOCAL_ID = 'local:abc';

  beforeEach(() => {
    const base = { usernameConfirmed: true, createdAt: '', updatedAt: '' };
    fakeCosmos.seed('users', [
      {
        ...base,
        id: ADMIN_ID,
        displayName: 'Admin',
        email: 'a@x',
        role: 'admin',
      },
      {
        ...base,
        id: TASTER_ID,
        displayName: 'Taster',
        email: 't@x',
        role: 'taster',
      },
      {
        ...base,
        id: LOCAL_ID,
        displayName: 'Alice',
        email: '',
        role: 'taster',
        authProvider: 'local',
      },
    ]);
    fakeCosmos.seed('credentials', [
      {
        id: 'alice',
        username: 'Alice',
        userId: LOCAL_ID,
        passwordHash: 'hash',
        failedAttempts: 0,
        lockedUntil: null,
      },
    ]);
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: 'e1',
        whiskeyId: 'w1',
        userId: LOCAL_ID,
        userName: 'Alice',
        score: 8,
      },
    ]);
  });

  const admin = makePrincipal({ userId: ADMIN_ID });

  async function remove(id: string, principal = admin) {
    return deleteUser(
      makeRequest({ principal, params: { id } }),
      makeContext(),
    );
  }

  async function exists(container: string, id: string, pk = id) {
    const { resource } = await fakeCosmos
      .getContainer(container)
      .item(id, pk)
      .read();
    return resource !== undefined;
  }

  it('removes an Entra ID user profile', async () => {
    const res = await remove(TASTER_ID);
    expect(res.status).toBe(204);
    expect(await exists('users', TASTER_ID)).toBe(false);
  });

  it('removes a native user and their credentials but keeps their ratings', async () => {
    const res = await remove(LOCAL_ID);
    expect(res.status).toBe(204);
    expect(await exists('users', LOCAL_ID)).toBe(false);
    expect(await exists('credentials', 'alice')).toBe(false);
    expect(await exists('ratings', 'r1', 'e1')).toBe(true);
  });

  it('refuses to let an admin remove themselves', async () => {
    const res = await remove(ADMIN_ID);
    expect(readJson(res)).toMatchObject({
      status: 400,
      data: { message: 'You cannot remove your own account' },
    });
    expect(await exists('users', ADMIN_ID)).toBe(true);
  });

  it('returns 404 for an unknown user', async () => {
    const res = await remove('nobody');
    expect(res.status).toBe(404);
  });

  it('rejects a non-admin caller', async () => {
    const res = await remove(LOCAL_ID, makePrincipal({ userId: TASTER_ID }));
    expect(res.status).toBe(403);
    expect(await exists('users', LOCAL_ID)).toBe(true);
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await deleteUser(
      makeRequest({ params: { id: LOCAL_ID } }),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });
});
