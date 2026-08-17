import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { eventsApi } from './events';

const EVENT = {
  id: 'e1',
  name: 'Event 1',
  description: 'desc',
  date: '2026-01-01',
  createdBy: 'Admin',
  createdAt: '',
  updatedAt: '',
  whiskeyCount: 0,
};

describe('eventsApi', () => {
  it('getAll: GET /events, unwraps data envelope', async () => {
    server.use(
      http.get('/api/events', () => HttpResponse.json({ data: [EVENT] })),
    );
    const result = await eventsApi.getAll();
    expect(result).toEqual([EVENT]);
  });

  it('getById: GET /events/:id', async () => {
    server.use(
      http.get('/api/events/e1', () => HttpResponse.json({ data: EVENT })),
    );
    const result = await eventsApi.getById('e1');
    expect(result).toEqual(EVENT);
  });

  it('create: POST /events with body, unwraps response', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/events', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ data: EVENT }, { status: 201 });
      }),
    );
    const input = { name: 'Event 1', description: 'desc', date: '2026-01-01' };
    const result = await eventsApi.create(input);
    expect(capturedBody).toEqual(input);
    expect(result).toEqual(EVENT);
  });

  it('update: PATCH /events/:id with body', async () => {
    let capturedBody: unknown;
    server.use(
      http.patch('/api/events/e1', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ data: { ...EVENT, name: 'Renamed' } });
      }),
    );
    const result = await eventsApi.update('e1', { name: 'Renamed' });
    expect(capturedBody).toEqual({ name: 'Renamed' });
    expect(result.name).toBe('Renamed');
  });

  it('delete: DELETE /events/:id', async () => {
    let called = false;
    server.use(
      http.delete('/api/events/e1', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await eventsApi.delete('e1');
    expect(called).toBe(true);
  });
});
