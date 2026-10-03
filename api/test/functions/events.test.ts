import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  getEvents,
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
} from '../../src/functions/events';

const TASTER_ID = 'taster1';
const ADMIN_ID = 'admin1';
const OTHER_TASTER_ID = 'taster2';

function seedUsers() {
  fakeCosmos.seed('users', [
    {
      id: TASTER_ID,
      displayName: 'Taster One',
      email: 't1@example.com',
      role: 'taster',
      usernameConfirmed: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: OTHER_TASTER_ID,
      displayName: 'Taster Two',
      email: 't2@example.com',
      role: 'taster',
      usernameConfirmed: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: ADMIN_ID,
      displayName: 'Admin',
      email: 'a1@example.com',
      role: 'admin',
      usernameConfirmed: true,
      createdAt: '',
      updatedAt: '',
    },
  ]);
}

beforeEach(() => {
  fakeCosmos.reset();
  seedUsers();
});

describe('getEvents', () => {
  it('lists events publicly with no principal required', async () => {
    fakeCosmos.seed('events', [
      {
        id: 'e1',
        name: 'Event 1',
        description: '',
        date: '2026-01-01',
        createdBy: 'Admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        whiskeyCount: 0,
      },
    ]);
    const res = await getEvents(makeRequest(), makeContext());
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { data: unknown[] }).data).toHaveLength(1);
  });
});

describe('createEvent', () => {
  it('requires taster role', async () => {
    const res = await createEvent(
      makeRequest({ body: { name: 'X', date: '2026-01-01' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(401);
  });

  it('validates required fields', async () => {
    const res = await createEvent(
      makeRequest({
        principal: makePrincipal({ userId: TASTER_ID }),
        body: {},
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('initializes whiskeyCount to 0', async () => {
    const res = await createEvent(
      makeRequest({
        principal: makePrincipal({ userId: TASTER_ID }),
        body: { name: 'New Event', date: '2026-05-01' },
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(201);
    expect((data as { data: { whiskeyCount: number } }).data.whiskeyCount).toBe(
      0,
    );
  });
});

describe('getEvent', () => {
  it('returns 404 for a missing event', async () => {
    const res = await getEvent(
      makeRequest({ params: { eventId: 'missing' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(404);
  });

  it('returns the event when found', async () => {
    fakeCosmos.seed('events', [
      {
        id: 'e1',
        name: 'Event 1',
        description: '',
        date: '2026-01-01',
        createdBy: 'Admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        whiskeyCount: 0,
      },
    ]);
    const res = await getEvent(
      makeRequest({ params: { eventId: 'e1' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(200);
  });
});

describe('updateEvent authorization matrix', () => {
  beforeEach(() => {
    fakeCosmos.seed('events', [
      {
        id: 'e1',
        name: 'Event 1',
        description: '',
        date: '2026-01-01',
        createdBy: 'Taster One',
        createdByUserId: TASTER_ID,
        createdAt: '',
        updatedAt: '',
        whiskeyCount: 0,
      },
    ]);
  });

  it('anonymous -> 401', async () => {
    const res = await updateEvent(
      makeRequest({ params: { eventId: 'e1' }, body: { name: 'New' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(401);
  });

  it('non-creator taster -> 403', async () => {
    const res = await updateEvent(
      makeRequest({
        params: { eventId: 'e1' },
        principal: makePrincipal({ userId: OTHER_TASTER_ID }),
        body: { name: 'New' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(403);
  });

  it('creator -> 200', async () => {
    const res = await updateEvent(
      makeRequest({
        params: { eventId: 'e1' },
        principal: makePrincipal({ userId: TASTER_ID }),
        body: { name: 'Updated Name' },
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { data: { name: string } }).data.name).toBe('Updated Name');
  });

  it('admin -> 200', async () => {
    const res = await updateEvent(
      makeRequest({
        params: { eventId: 'e1' },
        principal: makePrincipal({ userId: ADMIN_ID }),
        body: { name: 'Admin Updated' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(200);
  });

  it('missing event -> 404', async () => {
    const res = await updateEvent(
      makeRequest({
        params: { eventId: 'missing' },
        principal: makePrincipal({ userId: TASTER_ID }),
        body: { name: 'New' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(404);
  });
});

describe('deleteEvent authorization matrix', () => {
  beforeEach(() => {
    fakeCosmos.seed('events', [
      {
        id: 'e1',
        name: 'Event 1',
        description: '',
        date: '2026-01-01',
        createdBy: 'Taster One',
        createdByUserId: TASTER_ID,
        createdAt: '',
        updatedAt: '',
        whiskeyCount: 0,
      },
    ]);
  });

  it('anonymous -> 401', async () => {
    const res = await deleteEvent(
      makeRequest({ params: { eventId: 'e1' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(401);
  });

  it('non-creator taster -> 403', async () => {
    const res = await deleteEvent(
      makeRequest({
        params: { eventId: 'e1' },
        principal: makePrincipal({ userId: OTHER_TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(403);
  });

  it('creator -> 200/204', async () => {
    const res = await deleteEvent(
      makeRequest({
        params: { eventId: 'e1' },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(204);
  });

  it('admin -> 200/204', async () => {
    const res = await deleteEvent(
      makeRequest({
        params: { eventId: 'e1' },
        principal: makePrincipal({ userId: ADMIN_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(204);
  });

  it('missing event -> 404', async () => {
    const res = await deleteEvent(
      makeRequest({
        params: { eventId: 'missing' },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(404);
  });
});
