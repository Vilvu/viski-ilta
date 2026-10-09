import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createTestQueryClient } from '../test/renderWithProviders';

const connection = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  reconnected: undefined as undefined | (() => void),
  start: vi.fn(),
  stop: vi.fn(),
}));
const withUrl = vi.hoisted(() => vi.fn());

vi.mock('@microsoft/signalr', () => {
  class HubConnectionBuilder {
    withUrl(url: string) {
      withUrl(url);
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    configureLogging() {
      return this;
    }
    build() {
      return {
        on: (target: string, cb: (payload: unknown) => void) =>
          connection.handlers.set(target, cb),
        onreconnected: (cb: () => void) => {
          connection.reconnected = cb;
        },
        start: connection.start,
        stop: connection.stop,
      };
    }
  }
  return { HubConnectionBuilder, LogLevel: { None: 6 } };
});

import { useRealtime, REALTIME_HANDLERS } from './useRealtime';

function makeWrapper() {
  const queryClient = createTestQueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { wrapper, invalidateSpy, queryClient };
}

function invalidatedKeys(spy: ReturnType<typeof makeWrapper>['invalidateSpy']) {
  return spy.mock.calls.map((call) => call[0]?.queryKey);
}

beforeEach(() => {
  connection.handlers.clear();
  connection.reconnected = undefined;
  connection.start.mockReset().mockResolvedValue(undefined);
  connection.stop.mockReset().mockResolvedValue(undefined);
  withUrl.mockReset();
});

describe('REALTIME_HANDLERS', () => {
  it('ratingsChanged invalidates event, global and ranking queries', () => {
    const { queryClient, invalidateSpy } = makeWrapper();
    REALTIME_HANDLERS.ratingsChanged(queryClient, {
      eventId: 'e1',
      whiskeyId: 'w1',
    });
    expect(invalidatedKeys(invalidateSpy)).toEqual([
      ['ratings', 'e1', 'w1'],
      ['ratings', 'global', 'w1'],
      ['whiskeys', 'e1'],
      ['whiskeys', 'ranking'],
      ['whiskeys', 'catalog', 'w1'],
    ]);
  });

  it('eventWhiskeysChanged invalidates the event lineup and dependents', () => {
    const { queryClient, invalidateSpy } = makeWrapper();
    REALTIME_HANDLERS.eventWhiskeysChanged(queryClient, { eventId: 'e1' });
    expect(invalidatedKeys(invalidateSpy)).toEqual([
      ['whiskeys', 'e1'],
      ['ratings', 'e1'],
      ['whiskeys', 'ranking'],
      ['events'],
    ]);
  });

  it('eventsChanged invalidates events', () => {
    const { queryClient, invalidateSpy } = makeWrapper();
    REALTIME_HANDLERS.eventsChanged(queryClient, { eventId: 'e1' });
    expect(invalidatedKeys(invalidateSpy)).toEqual([['events']]);
  });

  it('catalogChanged invalidates whiskeys, ratings and events', () => {
    const { queryClient, invalidateSpy } = makeWrapper();
    REALTIME_HANDLERS.catalogChanged(queryClient, { whiskeyId: 'w1' });
    expect(invalidatedKeys(invalidateSpy)).toEqual([
      ['whiskeys'],
      ['ratings'],
      ['events'],
    ]);
  });
});

describe('useRealtime', () => {
  it('does not connect when disabled', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useRealtime(false), { wrapper });
    expect(connection.start).not.toHaveBeenCalled();
  });

  it('connects to the API base url and stops on unmount', () => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useRealtime(true), { wrapper });
    expect(withUrl).toHaveBeenCalledWith(`${window.location.origin}/api`);
    expect(connection.start).toHaveBeenCalledTimes(1);
    unmount();
    expect(connection.stop).toHaveBeenCalledTimes(1);
  });

  it('routes server messages to the matching handler', () => {
    const { wrapper, invalidateSpy } = makeWrapper();
    renderHook(() => useRealtime(true), { wrapper });
    connection.handlers.get('eventsChanged')!({ eventId: 'e1' });
    expect(invalidatedKeys(invalidateSpy)).toEqual([['events']]);
  });

  it('invalidates everything after a reconnect', () => {
    const { wrapper, invalidateSpy } = makeWrapper();
    renderHook(() => useRealtime(true), { wrapper });
    connection.reconnected!();
    expect(invalidateSpy).toHaveBeenCalledWith();
  });

  it('swallows a failed start', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    connection.start.mockRejectedValue(new Error('503'));
    const { wrapper } = makeWrapper();
    renderHook(() => useRealtime(true), { wrapper });
    await waitFor(() => expect(debug).toHaveBeenCalled());
    debug.mockRestore();
  });
});
