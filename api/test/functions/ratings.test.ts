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
  getRatings,
  upsertMyRating,
  deleteMyRating,
  getWhiskeyRatingsGlobally,
} from '../../src/functions/ratings';

const TASTER_ID = 'user1';
const OTHER_USER_ID = 'user2';
const EVENT_ID = 'event1';
const WHISKEY_ID = 'w1';

function seedBase() {
  fakeCosmos.seed('users', [
    {
      id: TASTER_ID,
      displayName: 'Alice',
      email: 'alice@example.com',
      role: 'taster',
      usernameConfirmed: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: OTHER_USER_ID,
      displayName: 'Bob',
      email: 'bob@example.com',
      role: 'anonymous',
      usernameConfirmed: true,
      createdAt: '',
      updatedAt: '',
    },
  ]);
  fakeCosmos.seed('eventWhiskeys', [
    {
      id: 'link1',
      eventId: EVENT_ID,
      whiskeyId: WHISKEY_ID,
      addedBy: 'admin',
      addedByUserId: 'admin',
      createdAt: '',
      averageRating: 0,
      ratingCount: 0,
    },
  ]);
  fakeCosmos.seed('whiskeys', [
    {
      id: WHISKEY_ID,
      name: 'Lagavulin 16',
      createdBy: 'admin',
      createdByUserId: 'admin',
      createdAt: '',
      updatedAt: '',
      globalAverageRating: 0,
      globalRatingCount: 0,
    },
  ]);
}

beforeEach(() => {
  fakeCosmos.reset();
  seedBase();
});

describe('upsertMyRating validation', () => {
  const taster = makePrincipal({ userId: TASTER_ID });

  it('accepts 0', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: 0 },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(200);
  });

  it('accepts 10', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: 10 },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(200);
  });

  it('rejects -1', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: -1 },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('rejects 11', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: 11 },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('rejects a numeric string', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: '5' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('rejects NaN', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: NaN },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('rejects Infinity', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: Infinity },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('rejects a missing score', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: {},
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(400);
  });

  it('anonymous -> 401', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        body: { score: 5 },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(401);
  });

  it('anonymous-role user -> 403', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: OTHER_USER_ID }),
        body: { score: 5 },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(403);
  });
});

describe('upsertMyRating create/update semantics', () => {
  const taster = makePrincipal({ userId: TASTER_ID });

  it('creates a new rating when absent and recomputes both aggregates', async () => {
    const res = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: 8, notes: 'Great' },
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(200);

    const link = await fakeCosmos
      .getContainer('eventWhiskeys')
      .item('link1', EVENT_ID)
      .read();
    expect(link.resource).toMatchObject({ averageRating: 8, ratingCount: 1 });

    const whiskey = await fakeCosmos
      .getContainer('whiskeys')
      .item(WHISKEY_ID, WHISKEY_ID)
      .read();
    expect(whiskey.resource).toMatchObject({
      globalAverageRating: 8,
      globalRatingCount: 1,
    });
  });

  it('preserves id and createdAt while refreshing the rest on update', async () => {
    const first = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: 6, notes: 'Meh' },
      }),
      makeContext(),
    );
    const firstData = readJson(first).data as {
      data: { id: string; createdAt: string };
    };

    const second = await upsertMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
        body: { score: 9, notes: 'Actually excellent' },
      }),
      makeContext(),
    );
    const secondData = readJson(second).data as {
      data: {
        id: string;
        createdAt: string;
        score: number;
        notes: string;
        userName: string;
      };
    };

    expect(secondData.data.id).toBe(firstData.data.id);
    expect(secondData.data.createdAt).toBe(firstData.data.createdAt);
    expect(secondData.data.score).toBe(9);
    expect(secondData.data.notes).toBe('Actually excellent');
    expect(secondData.data.userName).toBe('Alice');

    const link = await fakeCosmos
      .getContainer('eventWhiskeys')
      .item('link1', EVENT_ID)
      .read();
    expect(link.resource).toMatchObject({ averageRating: 9, ratingCount: 1 });
  });
});

describe('deleteMyRating', () => {
  const taster = makePrincipal({ userId: TASTER_ID });

  it('returns 404 when no rating exists', async () => {
    const res = await deleteMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(404);
  });

  it("deletes only the caller's rating and recomputes aggregates", async () => {
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        userId: TASTER_ID,
        userName: 'Alice',
        score: 8,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        userId: OTHER_USER_ID,
        userName: 'Bob',
        score: 6,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const res = await deleteMyRating(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: taster,
      }),
      makeContext(),
    );
    expect(readJson(res).status).toBe(204);

    const remaining = await fakeCosmos
      .getContainer('ratings')
      .item('r1', EVENT_ID)
      .read();
    expect(remaining.resource).toBeUndefined();

    const bobsRating = await fakeCosmos
      .getContainer('ratings')
      .item('r2', EVENT_ID)
      .read();
    expect(bobsRating.resource).toBeDefined();

    const link = await fakeCosmos
      .getContainer('eventWhiskeys')
      .item('link1', EVENT_ID)
      .read();
    // Only Bob's rating (6) remains.
    expect(link.resource).toMatchObject({ averageRating: 6, ratingCount: 1 });
  });
});

describe('getRatings (event-scoped list)', () => {
  it('filters by eventId and whiskeyId', async () => {
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        userId: TASTER_ID,
        userName: 'Alice',
        score: 8,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '',
      },
      {
        id: 'r2',
        eventId: 'event2',
        whiskeyId: WHISKEY_ID,
        userId: TASTER_ID,
        userName: 'Alice',
        score: 6,
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '',
      },
    ]);
    const res = await getRatings(
      makeRequest({
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    const list = (data as { data: Array<{ id: string }> }).data;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('r1');
  });
});

describe('getWhiskeyRatingsGlobally', () => {
  it('is cross-partition and respects TOP 100', async () => {
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: EVENT_ID,
        whiskeyId: WHISKEY_ID,
        userId: TASTER_ID,
        userName: 'Alice',
        score: 8,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '',
      },
      {
        id: 'r2',
        eventId: 'event2',
        whiskeyId: WHISKEY_ID,
        userId: OTHER_USER_ID,
        userName: 'Bob',
        score: 6,
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '',
      },
    ]);
    const res = await getWhiskeyRatingsGlobally(
      makeRequest({
        params: { whiskeyId: WHISKEY_ID },
        principal: makePrincipal({ userId: TASTER_ID }),
      }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { data: unknown[] }).data).toHaveLength(2);

    const call = fakeCosmos.calls.find((c) =>
      c.query.startsWith('SELECT TOP 100'),
    );
    expect(call?.enableCrossPartitionQuery).toBe(true);
  });
});
