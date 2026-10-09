import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeCosmos } from '../helpers/mockCosmos';
import { fakeBlob } from '../helpers/mockBlob';
import { makeRequest, makeContext, makePrincipal } from '../helpers/request';

vi.mock('../../src/lib/cosmos', () => ({
  getContainer: (name: string) => fakeCosmos.getContainer(name),
}));

vi.mock('../../src/lib/blob', () => ({
  getBlobStore: () => fakeBlob,
}));

const broadcastMock = vi.fn();
vi.mock('../../src/lib/realtime', () => ({
  broadcast: (...args: unknown[]) => broadcastMock(...args),
}));

import { upsertMyRating, deleteMyRating } from '../../src/functions/ratings';
import {
  createEvent,
  updateEvent,
  deleteEvent,
} from '../../src/functions/events';
import {
  createCatalogWhiskey,
  updateCatalogWhiskey,
  deleteCatalogWhiskey,
  addWhiskeyToEvent,
  removeWhiskeyFromEvent,
  uploadWhiskeyImage,
  deleteWhiskeyImage,
} from '../../src/functions/whiskeys';

const ADMIN = makePrincipal({ userId: 'admin1' });
const EVENT_ID = 'e1';
const WHISKEY_ID = 'w1';

function seed() {
  fakeCosmos.seed('users', [
    {
      id: 'admin1',
      displayName: 'Admin',
      email: 'a@example.com',
      role: 'admin',
      usernameConfirmed: true,
      createdAt: '',
      updatedAt: '',
    },
  ]);
  fakeCosmos.seed('events', [
    {
      id: EVENT_ID,
      name: 'Evening',
      description: '',
      date: '2026-01-01',
      createdBy: 'Admin',
      createdByUserId: 'admin1',
      createdAt: '',
      updatedAt: '',
      whiskeyCount: 1,
    },
  ]);
  fakeCosmos.seed('whiskeys', [
    {
      id: WHISKEY_ID,
      name: 'Lagavulin 16',
      createdBy: 'Admin',
      createdByUserId: 'admin1',
      createdAt: '',
      updatedAt: '',
      globalAverageRating: 0,
      globalRatingCount: 0,
    },
    {
      id: 'w2',
      name: 'Talisker 10',
      createdBy: 'Admin',
      createdByUserId: 'admin1',
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
      addedBy: 'Admin',
      addedByUserId: 'admin1',
      createdAt: '',
      averageRating: 0,
      ratingCount: 0,
    },
  ]);
}

beforeEach(() => {
  fakeCosmos.reset();
  fakeBlob.reset();
  seed();
  broadcastMock.mockReset();
});

const ctx = makeContext();

describe('mutation handlers broadcast invalidation hints', () => {
  it('upsertMyRating -> ratingsChanged', async () => {
    const res = await upsertMyRating(
      makeRequest({
        principal: ADMIN,
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        body: { score: 8 },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(broadcastMock).toHaveBeenCalledWith('ratingsChanged', {
      eventId: EVENT_ID,
      whiskeyId: WHISKEY_ID,
    });
  });

  it('upsertMyRating does not broadcast on validation failure', async () => {
    const res = await upsertMyRating(
      makeRequest({
        principal: ADMIN,
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
        body: { score: 11 },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it('deleteMyRating -> ratingsChanged', async () => {
    const params = { eventId: EVENT_ID, whiskeyId: WHISKEY_ID };
    await upsertMyRating(
      makeRequest({ principal: ADMIN, params, body: { score: 5 } }),
      ctx,
    );
    broadcastMock.mockReset();
    const res = await deleteMyRating(
      makeRequest({ principal: ADMIN, params }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(broadcastMock).toHaveBeenCalledWith('ratingsChanged', params);
  });

  it('createEvent / updateEvent / deleteEvent -> eventsChanged', async () => {
    const created = await createEvent(
      makeRequest({
        principal: ADMIN,
        body: { name: 'New', date: '2026-02-02' },
      }),
      ctx,
    );
    expect(created.status).toBe(201);
    expect(broadcastMock).toHaveBeenLastCalledWith('eventsChanged', {
      eventId: expect.any(String),
    });

    const updated = await updateEvent(
      makeRequest({
        principal: ADMIN,
        params: { eventId: EVENT_ID },
        body: { name: 'Renamed' },
      }),
      ctx,
    );
    expect(updated.status).toBe(200);
    expect(broadcastMock).toHaveBeenLastCalledWith('eventsChanged', {
      eventId: EVENT_ID,
    });

    const deleted = await deleteEvent(
      makeRequest({ principal: ADMIN, params: { eventId: EVENT_ID } }),
      ctx,
    );
    expect(deleted.status).toBe(204);
    expect(broadcastMock).toHaveBeenLastCalledWith('eventsChanged', {
      eventId: EVENT_ID,
    });
  });

  it('deleteEvent does not broadcast when the event is missing', async () => {
    const res = await deleteEvent(
      makeRequest({ principal: ADMIN, params: { eventId: 'missing' } }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it('catalog create / update / delete -> catalogChanged', async () => {
    const created = await createCatalogWhiskey(
      makeRequest({ principal: ADMIN, body: { name: 'Ardbeg 10' } }),
      ctx,
    );
    expect(created.status).toBe(201);
    expect(broadcastMock).toHaveBeenLastCalledWith('catalogChanged', {
      whiskeyId: expect.any(String),
    });

    const updated = await updateCatalogWhiskey(
      makeRequest({
        principal: ADMIN,
        params: { whiskeyId: 'w2' },
        body: { name: 'Talisker 10 Year' },
      }),
      ctx,
    );
    expect(updated.status).toBe(200);
    expect(broadcastMock).toHaveBeenLastCalledWith('catalogChanged', {
      whiskeyId: 'w2',
    });

    const deleted = await deleteCatalogWhiskey(
      makeRequest({ principal: ADMIN, params: { whiskeyId: 'w2' } }),
      ctx,
    );
    expect(deleted.status).toBe(204);
    expect(broadcastMock).toHaveBeenLastCalledWith('catalogChanged', {
      whiskeyId: 'w2',
    });
  });

  it('addWhiskeyToEvent / removeWhiskeyFromEvent -> eventWhiskeysChanged', async () => {
    const added = await addWhiskeyToEvent(
      makeRequest({
        principal: ADMIN,
        params: { eventId: EVENT_ID },
        body: { whiskeyId: 'w2' },
      }),
      ctx,
    );
    expect(added.status).toBe(201);
    expect(broadcastMock).toHaveBeenLastCalledWith('eventWhiskeysChanged', {
      eventId: EVENT_ID,
      whiskeyId: 'w2',
    });

    const removed = await removeWhiskeyFromEvent(
      makeRequest({
        principal: ADMIN,
        params: { eventId: EVENT_ID, whiskeyId: WHISKEY_ID },
      }),
      ctx,
    );
    expect(removed.status).toBe(204);
    expect(broadcastMock).toHaveBeenLastCalledWith('eventWhiskeysChanged', {
      eventId: EVENT_ID,
      whiskeyId: WHISKEY_ID,
    });
  });

  it('addWhiskeyToEvent does not broadcast on a duplicate link', async () => {
    const res = await addWhiskeyToEvent(
      makeRequest({
        principal: ADMIN,
        params: { eventId: EVENT_ID },
        body: { whiskeyId: WHISKEY_ID },
      }),
      ctx,
    );
    expect(res.status).toBe(409);
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it('photo upload / delete -> catalogChanged', async () => {
    const uploaded = await uploadWhiskeyImage(
      makeRequest({
        principal: ADMIN,
        params: { whiskeyId: WHISKEY_ID },
        headers: { 'content-type': 'image/jpeg' },
        rawBody: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
      }),
      ctx,
    );
    expect(uploaded.status).toBe(200);
    expect(broadcastMock).toHaveBeenLastCalledWith('catalogChanged', {
      whiskeyId: WHISKEY_ID,
    });

    broadcastMock.mockReset();
    const deleted = await deleteWhiskeyImage(
      makeRequest({ principal: ADMIN, params: { whiskeyId: WHISKEY_ID } }),
      ctx,
    );
    expect(deleted.status).toBe(204);
    expect(broadcastMock).toHaveBeenCalledWith('catalogChanged', {
      whiskeyId: WHISKEY_ID,
    });
  });
});
