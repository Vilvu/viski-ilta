import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { ratingsApi } from './ratings';

const RATING = {
  id: 'r1',
  whiskeyId: 'w1',
  eventId: 'e1',
  userId: 'u1',
  userName: 'Alice',
  score: 8,
  createdAt: '',
  updatedAt: '',
};

describe('ratingsApi', () => {
  it('getByEventWhiskey: GET /events/:eventId/whiskeys/:whiskeyId/ratings', async () => {
    server.use(
      http.get('/api/events/e1/whiskeys/w1/ratings', () =>
        HttpResponse.json({ data: [RATING] }),
      ),
    );
    const result = await ratingsApi.getByEventWhiskey('e1', 'w1');
    expect(result).toEqual([RATING]);
  });

  it('getByWhiskey: GET /whiskeys/:whiskeyId/ratings', async () => {
    server.use(
      http.get('/api/whiskeys/w1/ratings', () =>
        HttpResponse.json({ data: [RATING] }),
      ),
    );
    const result = await ratingsApi.getByWhiskey('w1');
    expect(result).toEqual([RATING]);
  });

  it('upsert: PUT /events/:eventId/whiskeys/:whiskeyId/ratings/me with body, including score 0', async () => {
    let capturedBody: unknown;
    server.use(
      http.put('/api/events/e1/whiskeys/w1/ratings/me', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ data: { ...RATING, score: 0 } });
      }),
    );
    const result = await ratingsApi.upsert('e1', 'w1', {
      score: 0,
      notes: 'x',
    });
    expect(capturedBody).toEqual({ score: 0, notes: 'x' });
    expect(result.score).toBe(0);
  });

  it('delete: DELETE /events/:eventId/whiskeys/:whiskeyId/ratings/me', async () => {
    let called = false;
    server.use(
      http.delete('/api/events/e1/whiskeys/w1/ratings/me', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await ratingsApi.delete('e1', 'w1');
    expect(called).toBe(true);
  });
});
