import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { createTestQueryClient } from '../test/renderWithProviders';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useRatings,
  useWhiskeyRatingsGlobally,
  useUpsertRating,
  useDeleteRating,
} from './useRatings';

function makeWrapper() {
  const queryClient = createTestQueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { wrapper, invalidateSpy };
}

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

describe('useRatings', () => {
  it('fetches ratings for an event-scoped whiskey', async () => {
    server.use(
      http.get('/api/events/e1/whiskeys/w1/ratings', () =>
        HttpResponse.json({ data: [RATING] }),
      ),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useRatings('e1', 'w1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([RATING]);
  });
});

describe('useWhiskeyRatingsGlobally', () => {
  it('fetches ratings for a catalog whiskey', async () => {
    server.use(
      http.get('/api/whiskeys/w1/ratings', () =>
        HttpResponse.json({ data: [RATING] }),
      ),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWhiskeyRatingsGlobally('w1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([RATING]);
  });
});

describe('useUpsertRating', () => {
  it('invalidates ratings, event whiskeys, and ranking query keys on success', async () => {
    server.use(
      http.put('/api/events/e1/whiskeys/w1/ratings/me', () =>
        HttpResponse.json({ data: RATING }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useUpsertRating(), { wrapper });
    result.current.mutate({
      eventId: 'e1',
      whiskeyId: 'w1',
      input: { score: 8 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['ratings', 'e1', 'w1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['whiskeys', 'e1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['whiskeys', 'e1', 'w1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['whiskeys', 'ranking'],
    });
  });
});

describe('useDeleteRating', () => {
  it('invalidates ratings, event whiskeys, and ranking query keys on success', async () => {
    server.use(
      http.delete(
        '/api/events/e1/whiskeys/w1/ratings/me',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useDeleteRating(), { wrapper });
    result.current.mutate({ eventId: 'e1', whiskeyId: 'w1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['ratings', 'e1', 'w1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['whiskeys', 'ranking'],
    });
  });
});
