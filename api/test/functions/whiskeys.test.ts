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
  getAllWhiskeys,
  createCatalogWhiskey,
  getCatalogWhiskey,
  updateCatalogWhiskey,
  deleteCatalogWhiskey,
  getEventWhiskeys,
  addWhiskeyToEvent,
  getEventWhiskey,
  removeWhiskeyFromEvent,
} from '../../src/functions/whiskeys';

const TASTER_ID = 'taster1';
const OTHER_TASTER_ID = 'taster2';
const ADMIN_ID = 'admin1';
const EVENT_ID = 'event1';
const EVENT2_ID = 'event2';
const WHISKEY_ID = 'w1';

function seedUsers() {
  fakeCosmos.seed('users', [
    {
      id: TASTER_ID,
      displayName: 'Taster',
      email: 't1@example.com',
      role: 'taster',
      usernameConfirmed: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: OTHER_TASTER_ID,
      displayName: 'Other',
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

describe('getAllWhiskeys (catalog list)', () => {
  it('orders by globalAverageRating DESC and respects OFFSET/LIMIT paging', async () => {
    fakeCosmos.seed('whiskeys', [
      {
        id: 'w-low',
        name: 'Low',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 5,
        globalRatingCount: 1,
      },
      {
        id: 'w-high',
        name: 'High',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 9,
        globalRatingCount: 1,
      },
      {
        id: 'w-mid',
        name: 'Mid',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 7,
        globalRatingCount: 1,
      },
    ]);
    const res = await getAllWhiskeys(
      makeRequest({ query: { top: '2', skip: '0' } }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    const list = (data as { data: Array<{ id: string }> }).data;
    expect(list.map((w) => w.id)).toEqual(['w-high', 'w-mid']);
  });

  it('pages with a non-zero skip', async () => {
    fakeCosmos.seed('whiskeys', [
      {
        id: 'w-low',
        name: 'Low',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 5,
        globalRatingCount: 1,
      },
      {
        id: 'w-high',
        name: 'High',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 9,
        globalRatingCount: 1,
      },
      {
        id: 'w-mid',
        name: 'Mid',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 7,
        globalRatingCount: 1,
      },
    ]);
    const res = await getAllWhiskeys(
      makeRequest({ query: { top: '2', skip: '2' } }),
      makeContext(),
    );
    const { data } = readJson(res);
    const list = (data as { data: Array<{ id: string }> }).data;
    expect(list.map((w) => w.id)).toEqual(['w-low']);
  });
});

describe('createCatalogWhiskey', () => {
  it('validates name is required', async () => {
    const res = await createCatalogWhiskey(
      makeRequest({
        principal: makePrincipal({ userId: TASTER_ID }),
        body: {},
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('requires taster role', async () => {
    const res = await createCatalogWhiskey(
      makeRequest({ body: { name: 'X' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(401);
  });

  it('creates a whiskey with zeroed global aggregates', async () => {
    const res = await createCatalogWhiskey(
      makeRequest({
        principal: makePrincipal({ userId: TASTER_ID }),
        body: { name: 'New Whiskey', distillery: 'Test' },
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(201);
    expect(
      (
        data as {
          data: { globalAverageRating: number; globalRatingCount: number };
        }
      ).data,
    ).toMatchObject({
      globalAverageRating: 0,
      globalRatingCount: 0,
    });
  });

  it('rejects a duplicate id via the underlying create() 409 path', async () => {
    fakeCosmos.seed('whiskeys', [
      {
        id: 'dup',
        name: 'Dup',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 0,
        globalRatingCount: 0,
      },
    ]);
    // insertCatalogWhiskey always generates a fresh uuid, so to exercise the
    // fake's duplicate-id guard directly we call the container the handler
    // itself would use.
    await expect(
      fakeCosmos.getContainer('whiskeys').items.create({
        id: 'dup',
        name: 'Dup 2',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 0,
        globalRatingCount: 0,
      }),
    ).rejects.toMatchObject({ code: 409 });
  });
});

describe('getCatalogWhiskey / updateCatalogWhiskey / deleteCatalogWhiskey authorization', () => {
  beforeEach(() => {
    fakeCosmos.seed('whiskeys', [
      {
        id: WHISKEY_ID,
        name: 'Lagavulin 16',
        createdBy: 'Taster',
        createdByUserId: TASTER_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 0,
        globalRatingCount: 0,
      },
    ]);
  });

  it('getCatalogWhiskey: 404 when missing', async () => {
    const res = await getCatalogWhiskey(
      makeRequest({ params: { whiskeyId: 'missing' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(404);
  });

  it('getCatalogWhiskey: returns the whiskey for anonymous callers', async () => {
    const res = await getCatalogWhiskey(
      makeRequest({ params: { whiskeyId: WHISKEY_ID } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(200);
  });

  it('updateCatalogWhiskey: creator can update', async () => {
    const res = await updateCatalogWhiskey(
      makeRequest({
        params: { whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
        body: { name: 'Renamed' },
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { data: { name: string } }).data.name).toBe('Renamed');
  });

  it('updateCatalogWhiskey: other taster forbidden', async () => {
    const res = await updateCatalogWhiskey(
      makeRequest({
        params: { whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: OTHER_TASTER_ID }),
        body: { name: 'Renamed' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(403);
  });

  it('updateCatalogWhiskey: admin can update', async () => {
    const res = await updateCatalogWhiskey(
      makeRequest({
        params: { whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: ADMIN_ID }),
        body: { name: 'Admin Renamed' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(200);
  });

  it('updateCatalogWhiskey: anonymous -> 401', async () => {
    const res = await updateCatalogWhiskey(
      makeRequest({ params: { whiskeyId: WHISKEY_ID }, body: { name: 'X' } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(401);
  });

  it('updateCatalogWhiskey: 404 when missing', async () => {
    const res = await updateCatalogWhiskey(
      makeRequest({
        params: { whiskeyId: 'missing' },
        principal: makePrincipal({ userId: TASTER_ID }),
        body: { name: 'X' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(404);
  });

  it('updateCatalogWhiskey: preserves aggregates even if body attempts to override them', async () => {
    fakeCosmos.reset();
    seedUsers();
    fakeCosmos.seed('whiskeys', [
      {
        id: WHISKEY_ID,
        name: 'Lagavulin 16',
        createdBy: 'Taster',
        createdByUserId: TASTER_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 8.2,
        globalRatingCount: 5,
      },
    ]);
    const res = await updateCatalogWhiskey(
      makeRequest({
        params: { whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
        body: {
          name: 'X',
          globalAverageRating: 0,
          globalRatingCount: 0,
        } as never,
      }),
      makeContext(),
    );
    const { data } = readJson(res);
    expect(
      (
        data as {
          data: { globalAverageRating: number; globalRatingCount: number };
        }
      ).data,
    ).toMatchObject({
      globalAverageRating: 8.2,
      globalRatingCount: 5,
    });
  });

  it('deleteCatalogWhiskey: anonymous -> 401', async () => {
    const res = await deleteCatalogWhiskey(
      makeRequest({ params: { whiskeyId: WHISKEY_ID } }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(401);
  });

  it('deleteCatalogWhiskey: other taster forbidden', async () => {
    const res = await deleteCatalogWhiskey(
      makeRequest({
        params: { whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: OTHER_TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(403);
  });

  it('deleteCatalogWhiskey: 404 when missing', async () => {
    const res = await deleteCatalogWhiskey(
      makeRequest({
        params: { whiskeyId: 'missing' },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(404);
  });
});

describe('deleteCatalogWhiskey cascade (regression: whiskeys.ts:325 increment bug)', () => {
  beforeEach(() => {
    fakeCosmos.seed('whiskeys', [
      {
        id: WHISKEY_ID,
        name: 'Lagavulin 16',
        createdBy: 'Taster',
        createdByUserId: TASTER_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 8,
        globalRatingCount: 2,
      },
    ]);
    fakeCosmos.seed('events', [
      {
        id: EVENT_ID,
        name: 'Event 1',
        description: '',
        date: '',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        whiskeyCount: 2,
      },
      {
        id: EVENT2_ID,
        name: 'Event 2',
        description: '',
        date: '',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        whiskeyCount: 1,
      },
    ]);
    fakeCosmos.seed('eventWhiskeys', [
      {
        id: 'link1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        addedBy: 'admin',
        addedByUserId: ADMIN_ID,
        createdAt: '',
        averageRating: 8,
        ratingCount: 1,
      },
      {
        id: 'link2',
        eventId: EVENT2_ID,
        whiskeyId: WHISKEY_ID,
        addedBy: 'admin',
        addedByUserId: ADMIN_ID,
        createdAt: '',
        averageRating: 8,
        ratingCount: 1,
      },
    ]);
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        userId: TASTER_ID,
        userName: 'Taster',
        score: 8,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        eventId: EVENT2_ID,
        whiskeyId: WHISKEY_ID,
        userId: TASTER_ID,
        userName: 'Taster',
        score: 8,
        createdAt: '',
        updatedAt: '',
      },
    ]);
  });

  it('removes links and ratings across every eventId partition and decrements whiskeyCount on each event', async () => {
    const res = await deleteCatalogWhiskey(
      makeRequest({
        params: { whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(204);

    const link1 = await fakeCosmos
      .getContainer('eventWhiskeys')
      .item('link1', EVENT_ID)
      .read();
    const link2 = await fakeCosmos
      .getContainer('eventWhiskeys')
      .item('link2', EVENT2_ID)
      .read();
    expect(link1.resource).toBeUndefined();
    expect(link2.resource).toBeUndefined();

    const rating1 = await fakeCosmos
      .getContainer('ratings')
      .item('r1', EVENT_ID)
      .read();
    const rating2 = await fakeCosmos
      .getContainer('ratings')
      .item('r2', EVENT2_ID)
      .read();
    expect(rating1.resource).toBeUndefined();
    expect(rating2.resource).toBeUndefined();

    // This is the regression assertion for the whiskeys.ts:325 fix: with
    // `op: 'increment'` (invalid Cosmos PatchOperationType), the fake throws
    // and the request would 500 instead of decrementing whiskeyCount on
    // *each* affected event.
    const event1 = await fakeCosmos
      .getContainer('events')
      .item(EVENT_ID, EVENT_ID)
      .read();
    const event2 = await fakeCosmos
      .getContainer('events')
      .item(EVENT2_ID, EVENT2_ID)
      .read();
    expect(event1.resource).toMatchObject({ whiskeyCount: 1 });
    expect(event2.resource).toMatchObject({ whiskeyCount: 0 });

    const whiskey = await fakeCosmos
      .getContainer('whiskeys')
      .item(WHISKEY_ID, WHISKEY_ID)
      .read();
    expect(whiskey.resource).toBeUndefined();
  });
});

describe('getEventWhiskeys (joined list)', () => {
  beforeEach(() => {
    fakeCosmos.seed('whiskeys', [
      {
        id: WHISKEY_ID,
        name: 'Lagavulin 16',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 8,
        globalRatingCount: 1,
      },
    ]);
    fakeCosmos.seed('eventWhiskeys', [
      {
        id: 'link1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        addedBy: 'admin',
        addedByUserId: ADMIN_ID,
        createdAt: '',
        averageRating: 8,
        ratingCount: 1,
      },
    ]);
  });

  it('returns the joined link + catalog shape with userRating populated for the caller', async () => {
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        userId: TASTER_ID,
        userName: 'Taster',
        score: 8,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    const res = await getEventWhiskeys(
      makeRequest({
        params: { eventId: EVENT_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    const list = (data as { data: Array<{ id: string; userRating?: number }> })
      .data;
    expect(list[0].userRating).toBe(8);
  });

  it('leaves userRating null/unset for anonymous callers', async () => {
    const res = await getEventWhiskeys(
      makeRequest({ params: { eventId: EVENT_ID } }),
      makeContext(),
    );
    const { data } = readJson(res);
    const list = (data as { data: Array<{ id: string; userRating?: number }> })
      .data;
    expect(list[0].userRating).toBeUndefined();
  });
});

describe('addWhiskeyToEvent (POST /events/{eventId}/whiskeys)', () => {
  beforeEach(() => {
    fakeCosmos.seed('events', [
      {
        id: EVENT_ID,
        name: 'Event 1',
        description: '',
        date: '',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        whiskeyCount: 0,
      },
    ]);
  });

  it('link-existing path increments whiskeyCount', async () => {
    fakeCosmos.seed('whiskeys', [
      {
        id: WHISKEY_ID,
        name: 'Lagavulin 16',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 0,
        globalRatingCount: 0,
      },
    ]);
    const res = await addWhiskeyToEvent(
      makeRequest({
        params: { eventId: EVENT_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
        body: { whiskeyId: WHISKEY_ID },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(201);
    const event = await fakeCosmos
      .getContainer('events')
      .item(EVENT_ID, EVENT_ID)
      .read();
    expect(event.resource).toMatchObject({ whiskeyCount: 1 });
  });

  it('create+link path creates the catalog whiskey and increments whiskeyCount', async () => {
    const res = await addWhiskeyToEvent(
      makeRequest({
        params: { eventId: EVENT_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
        body: { name: 'Brand New Whiskey' },
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(201);
    expect((data as { data: { name: string } }).data.name).toBe(
      'Brand New Whiskey',
    );
    const event = await fakeCosmos
      .getContainer('events')
      .item(EVENT_ID, EVENT_ID)
      .read();
    expect(event.resource).toMatchObject({ whiskeyCount: 1 });
  });

  it('rejects linking a whiskey already linked to the event with 409', async () => {
    fakeCosmos.seed('whiskeys', [
      {
        id: WHISKEY_ID,
        name: 'Lagavulin 16',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 0,
        globalRatingCount: 0,
      },
    ]);
    fakeCosmos.seed('eventWhiskeys', [
      {
        id: 'link1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        addedBy: 'admin',
        addedByUserId: ADMIN_ID,
        createdAt: '',
        averageRating: 0,
        ratingCount: 0,
      },
    ]);
    const res = await addWhiskeyToEvent(
      makeRequest({
        params: { eventId: EVENT_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
        body: { whiskeyId: WHISKEY_ID },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(409);
  });
});

describe('getEventWhiskey (single joined whiskey)', () => {
  beforeEach(() => {
    fakeCosmos.seed('whiskeys', [
      {
        id: WHISKEY_ID,
        name: 'Lagavulin 16',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 8,
        globalRatingCount: 1,
      },
    ]);
    fakeCosmos.seed('eventWhiskeys', [
      {
        id: 'link1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        addedBy: 'admin',
        addedByUserId: ADMIN_ID,
        createdAt: '',
        averageRating: 8,
        ratingCount: 1,
      },
    ]);
  });

  it('404 when the whiskey is not linked to the event', async () => {
    const res = await getEventWhiskey(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: 'missing' },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(404);
  });

  it('populates userRating for the authenticated caller', async () => {
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        userId: TASTER_ID,
        userName: 'Taster',
        score: 9,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    const res = await getEventWhiskey(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    const { data } = readJson(res);
    expect((data as { data: { userRating?: number } }).data.userRating).toBe(9);
  });
});

describe('removeWhiskeyFromEvent (DELETE /events/{eventId}/whiskeys/{whiskeyId})', () => {
  beforeEach(() => {
    fakeCosmos.seed('events', [
      {
        id: EVENT_ID,
        name: 'Event 1',
        description: '',
        date: '',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        whiskeyCount: 1,
      },
    ]);
    fakeCosmos.seed('whiskeys', [
      {
        id: WHISKEY_ID,
        name: 'Lagavulin 16',
        createdBy: 'admin',
        createdByUserId: ADMIN_ID,
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 8,
        globalRatingCount: 1,
      },
    ]);
    fakeCosmos.seed('eventWhiskeys', [
      {
        id: 'link1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        addedBy: 'Taster',
        addedByUserId: TASTER_ID,
        createdAt: '',
        averageRating: 8,
        ratingCount: 1,
      },
    ]);
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        userId: TASTER_ID,
        userName: 'Taster',
        score: 8,
        createdAt: '',
        updatedAt: '',
      },
    ]);
  });

  it('decrements whiskeyCount (line 719 incr) and never goes below 0', async () => {
    const res = await removeWhiskeyFromEvent(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(204);
    const event = await fakeCosmos
      .getContainer('events')
      .item(EVENT_ID, EVENT_ID)
      .read();
    expect(event.resource).toMatchObject({ whiskeyCount: 0 });
  });

  it('never decrements below 0 on a second removal attempt', async () => {
    await fakeCosmos
      .getContainer('events')
      .item(EVENT_ID, EVENT_ID)
      .patch([{ op: 'set', path: '/whiskeyCount', value: 0 }]);
    const res = await removeWhiskeyFromEvent(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(204);
    const event = await fakeCosmos
      .getContainer('events')
      .item(EVENT_ID, EVENT_ID)
      .read();
    expect(event.resource).toMatchObject({ whiskeyCount: 0 });
  });

  it('non-adder, non-admin taster is forbidden', async () => {
    const res = await removeWhiskeyFromEvent(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: OTHER_TASTER_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(403);
  });

  it('admin can remove even if not the adder', async () => {
    const res = await removeWhiskeyFromEvent(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: ADMIN_ID }),
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(204);
  });
});
