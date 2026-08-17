import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { catalogWhiskeysApi, eventWhiskeysApi } from './whiskeys';

const CATALOG_WHISKEY = {
  id: 'w1',
  name: 'Lagavulin 16',
  createdBy: 'Admin',
  createdAt: '',
  updatedAt: '',
  globalAverageRating: 8,
  globalRatingCount: 1,
};

const EVENT_WHISKEY = {
  id: 'w1',
  eventId: 'e1',
  name: 'Lagavulin 16',
  createdBy: 'Admin',
  createdAt: '',
  updatedAt: '',
  averageRating: 8,
  ratingCount: 1,
};

describe('catalogWhiskeysApi', () => {
  it('getAll: GET /whiskeys with no params omits the query string', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/whiskeys', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ data: [CATALOG_WHISKEY] });
      }),
    );
    const result = await catalogWhiskeysApi.getAll();
    expect(result).toEqual([CATALOG_WHISKEY]);
    expect(capturedUrl.endsWith('/api/whiskeys')).toBe(true);
  });

  it('getAll: GET /whiskeys?top=&skip= when params are provided', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/whiskeys', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ data: [] });
      }),
    );
    await catalogWhiskeysApi.getAll({ top: 10, skip: 5 });
    const url = new URL(capturedUrl);
    expect(url.searchParams.get('top')).toBe('10');
    expect(url.searchParams.get('skip')).toBe('5');
  });

  it('getById: GET /whiskeys/:id', async () => {
    server.use(
      http.get('/api/whiskeys/w1', () =>
        HttpResponse.json({ data: CATALOG_WHISKEY }),
      ),
    );
    const result = await catalogWhiskeysApi.getById('w1');
    expect(result).toEqual(CATALOG_WHISKEY);
  });

  it('create: POST /whiskeys with body', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/whiskeys', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ data: CATALOG_WHISKEY }, { status: 201 });
      }),
    );
    const input = { name: 'Lagavulin 16' };
    await catalogWhiskeysApi.create(input);
    expect(capturedBody).toEqual(input);
  });

  it('update: PATCH /whiskeys/:id with body', async () => {
    let capturedBody: unknown;
    server.use(
      http.patch('/api/whiskeys/w1', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ data: CATALOG_WHISKEY });
      }),
    );
    await catalogWhiskeysApi.update('w1', { name: 'Renamed' });
    expect(capturedBody).toEqual({ name: 'Renamed' });
  });

  it('delete: DELETE /whiskeys/:id', async () => {
    let called = false;
    server.use(
      http.delete('/api/whiskeys/w1', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await catalogWhiskeysApi.delete('w1');
    expect(called).toBe(true);
  });
});

describe('eventWhiskeysApi', () => {
  it('getByEvent: GET /events/:eventId/whiskeys', async () => {
    server.use(
      http.get('/api/events/e1/whiskeys', () =>
        HttpResponse.json({ data: [EVENT_WHISKEY] }),
      ),
    );
    const result = await eventWhiskeysApi.getByEvent('e1');
    expect(result).toEqual([EVENT_WHISKEY]);
  });

  it('getByEventAndId: GET /events/:eventId/whiskeys/:whiskeyId', async () => {
    server.use(
      http.get('/api/events/e1/whiskeys/w1', () =>
        HttpResponse.json({ data: EVENT_WHISKEY }),
      ),
    );
    const result = await eventWhiskeysApi.getByEventAndId('e1', 'w1');
    expect(result).toEqual(EVENT_WHISKEY);
  });

  it('addToEvent: POST /events/:eventId/whiskeys with body', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/events/e1/whiskeys', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ data: EVENT_WHISKEY }, { status: 201 });
      }),
    );
    await eventWhiskeysApi.addToEvent('e1', { whiskeyId: 'w1' });
    expect(capturedBody).toEqual({ whiskeyId: 'w1' });
  });

  it('removeFromEvent: DELETE /events/:eventId/whiskeys/:whiskeyId', async () => {
    let called = false;
    server.use(
      http.delete('/api/events/e1/whiskeys/w1', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await eventWhiskeysApi.removeFromEvent('e1', 'w1');
    expect(called).toBe(true);
  });
});
