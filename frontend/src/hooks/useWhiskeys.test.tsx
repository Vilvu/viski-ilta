import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { createTestQueryClient } from '../test/renderWithProviders';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useWhiskeys,
  useWhiskey,
  useAddWhiskeyToEvent,
  useRemoveWhiskeyFromEvent,
  useUpdateWhiskey,
  useAllWhiskeys,
  useCatalogWhiskey,
  useCreateCatalogWhiskey,
  useDeleteCatalogWhiskey,
} from './useWhiskeys';

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

const CATALOG_WHISKEY = {
  id: 'w1',
  name: 'Lagavulin 16',
  createdBy: 'Admin',
  createdAt: '',
  updatedAt: '',
  globalAverageRating: 8,
  globalRatingCount: 1,
};

describe('useWhiskeys / useWhiskey', () => {
  it('fetches event-linked whiskeys', async () => {
    server.use(
      http.get('/api/events/e1/whiskeys', () =>
        HttpResponse.json({ data: [EVENT_WHISKEY] }),
      ),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWhiskeys('e1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([EVENT_WHISKEY]);
  });

  it('fetches a single event-linked whiskey', async () => {
    server.use(
      http.get('/api/events/e1/whiskeys/w1', () =>
        HttpResponse.json({ data: EVENT_WHISKEY }),
      ),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWhiskey('e1', 'w1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(EVENT_WHISKEY);
  });
});

describe('useAddWhiskeyToEvent', () => {
  it('invalidates the event-whiskeys and event query keys on success', async () => {
    server.use(
      http.post('/api/events/e1/whiskeys', () =>
        HttpResponse.json({ data: EVENT_WHISKEY }, { status: 201 }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAddWhiskeyToEvent(), { wrapper });
    result.current.mutate({ eventId: 'e1', input: { whiskeyId: 'w1' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['whiskeys', 'e1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events', 'e1'] });
  });
});

describe('useRemoveWhiskeyFromEvent', () => {
  it('invalidates the event-whiskeys and event query keys on success', async () => {
    server.use(
      http.delete(
        '/api/events/e1/whiskeys/w1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useRemoveWhiskeyFromEvent(), {
      wrapper,
    });
    result.current.mutate({ eventId: 'e1', whiskeyId: 'w1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['whiskeys', 'e1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events', 'e1'] });
  });
});

describe('useUpdateWhiskey', () => {
  it('invalidates the ranking and all whiskeys query keys on success', async () => {
    server.use(
      http.patch('/api/whiskeys/w1', () =>
        HttpResponse.json({ data: CATALOG_WHISKEY }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useUpdateWhiskey(), { wrapper });
    result.current.mutate({ whiskeyId: 'w1', input: { name: 'X' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['whiskeys', 'ranking'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['whiskeys'] });
  });
});

describe('useAllWhiskeys / useCatalogWhiskey', () => {
  it('fetches the catalog ranking list', async () => {
    server.use(
      http.get('/api/whiskeys', () =>
        HttpResponse.json({ data: [CATALOG_WHISKEY] }),
      ),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAllWhiskeys(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([CATALOG_WHISKEY]);
  });

  it('fetches a single catalog whiskey', async () => {
    server.use(
      http.get('/api/whiskeys/w1', () =>
        HttpResponse.json({ data: CATALOG_WHISKEY }),
      ),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCatalogWhiskey('w1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(CATALOG_WHISKEY);
  });
});

describe('useCreateCatalogWhiskey', () => {
  it('invalidates the ranking query key on success', async () => {
    server.use(
      http.post('/api/whiskeys', () =>
        HttpResponse.json({ data: CATALOG_WHISKEY }, { status: 201 }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useCreateCatalogWhiskey(), { wrapper });
    result.current.mutate({ name: 'X' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['whiskeys', 'ranking'],
    });
  });
});

describe('useDeleteCatalogWhiskey', () => {
  it('invalidates the ranking and all whiskeys query keys on success', async () => {
    server.use(
      http.delete(
        '/api/whiskeys/w1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useDeleteCatalogWhiskey(), { wrapper });
    result.current.mutate('w1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['whiskeys', 'ranking'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['whiskeys'] });
  });
});
