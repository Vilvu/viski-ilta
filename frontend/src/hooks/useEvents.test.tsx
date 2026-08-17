import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { createTestQueryClient } from '../test/renderWithProviders';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useEvents,
  useEvent,
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
} from './useEvents';

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

const EVENT = {
  id: 'e1',
  name: 'Event 1',
  description: '',
  date: '2026-01-01',
  createdBy: 'Admin',
  createdAt: '',
  updatedAt: '',
  whiskeyCount: 0,
};

describe('useEvents', () => {
  it('maps success data from the API', async () => {
    server.use(
      http.get('/api/events', () => HttpResponse.json({ data: [EVENT] })),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEvents(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([EVENT]);
  });

  it('surfaces an error on failure', async () => {
    server.use(
      http.get('/api/events', () => new HttpResponse(null, { status: 500 })),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEvents(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useEvent', () => {
  it('fetches a single event by id', async () => {
    server.use(
      http.get('/api/events/e1', () => HttpResponse.json({ data: EVENT })),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEvent('e1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(EVENT);
  });
});

describe('useCreateEvent', () => {
  it('invalidates the events list query on success', async () => {
    server.use(
      http.post('/api/events', () =>
        HttpResponse.json({ data: EVENT }, { status: 201 }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useCreateEvent(), { wrapper });
    result.current.mutate({ name: 'X', description: '', date: '2026-01-01' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events'] });
  });
});

describe('useDeleteEvent', () => {
  it('invalidates the events list query on success', async () => {
    server.use(
      http.delete(
        '/api/events/e1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useDeleteEvent(), { wrapper });
    result.current.mutate('e1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events'] });
  });
});

describe('useUpdateEvent', () => {
  it('invalidates both the list and the single-event query keys on success', async () => {
    server.use(
      http.patch('/api/events/e1', () => HttpResponse.json({ data: EVENT })),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useUpdateEvent(), { wrapper });
    result.current.mutate({ id: 'e1', input: { name: 'Renamed' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events', 'e1'] });
  });
});
