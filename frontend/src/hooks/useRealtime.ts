import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  HubConnectionBuilder,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api';

/**
 * Invalidation hints pushed by the API (see api/src/lib/realtime.ts).
 * Payloads carry ids only; data is always refetched via the REST API.
 */
export interface RealtimePayloads {
  ratingsChanged: { eventId: string; whiskeyId: string };
  eventWhiskeysChanged: { eventId: string; whiskeyId?: string };
  eventsChanged: { eventId?: string };
  catalogChanged: { whiskeyId?: string };
}

type Handlers = {
  [K in keyof RealtimePayloads]: (
    queryClient: QueryClient,
    payload: RealtimePayloads[K],
  ) => void;
};

/**
 * Maps each server message to the query keys it invalidates. Mirrors the
 * `onSuccess` invalidations of the corresponding local mutations.
 */
export const REALTIME_HANDLERS: Handlers = {
  ratingsChanged: (qc, { eventId, whiskeyId }) => {
    qc.invalidateQueries({ queryKey: ['ratings', eventId, whiskeyId] });
    qc.invalidateQueries({ queryKey: ['ratings', 'global', whiskeyId] });
    qc.invalidateQueries({ queryKey: ['whiskeys', eventId] });
    qc.invalidateQueries({ queryKey: ['whiskeys', 'ranking'] });
    qc.invalidateQueries({ queryKey: ['whiskeys', 'catalog', whiskeyId] });
  },
  eventWhiskeysChanged: (qc, { eventId }) => {
    // Removing a whiskey also deletes its ratings and changes global averages.
    qc.invalidateQueries({ queryKey: ['whiskeys', eventId] });
    qc.invalidateQueries({ queryKey: ['ratings', eventId] });
    qc.invalidateQueries({ queryKey: ['whiskeys', 'ranking'] });
    qc.invalidateQueries({ queryKey: ['events'] });
  },
  eventsChanged: (qc) => {
    qc.invalidateQueries({ queryKey: ['events'] });
  },
  catalogChanged: (qc) => {
    // Catalog deletes cascade to event links and ratings.
    qc.invalidateQueries({ queryKey: ['whiskeys'] });
    qc.invalidateQueries({ queryKey: ['ratings'] });
    qc.invalidateQueries({ queryKey: ['events'] });
  },
};

/**
 * Keeps a SignalR connection open while `enabled` and invalidates TanStack
 * queries when other users change data. If the API reports real-time as
 * unavailable (negotiate returns 503), the app silently keeps working with
 * normal fetching.
 */
export function useRealtime(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    let connection: HubConnection;
    try {
      connection = new HubConnectionBuilder()
        // Resolve explicitly: SignalR refuses relative URLs outside a pure
        // browser environment (e.g. jsdom).
        .withUrl(new URL(baseURL, window.location.href).toString())
        .withAutomaticReconnect()
        .configureLogging(LogLevel.None)
        .build();
    } catch (error) {
      console.debug('Real-time updates unavailable:', error);
      return;
    }

    for (const [target, handler] of Object.entries(REALTIME_HANDLERS)) {
      connection.on(target, (payload) =>
        (handler as (qc: QueryClient, p: unknown) => void)(
          queryClient,
          payload,
        ),
      );
    }

    // Messages may have been missed while disconnected.
    connection.onreconnected(() => {
      queryClient.invalidateQueries();
    });

    let stopped = false;
    connection.start().catch((error: unknown) => {
      if (!stopped) console.debug('Real-time updates unavailable:', error);
    });

    return () => {
      stopped = true;
      void connection.stop();
    };
  }, [enabled, queryClient]);
}
