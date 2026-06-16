import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  catalogWhiskeysApi,
  eventWhiskeysApi,
  type CreateCatalogWhiskeyInput,
  type UpdateCatalogWhiskeyInput,
  type AddWhiskeyToEventInput,
} from '@/api/whiskeys';

// Event-linked whiskeys queries

/**
 * Fetch all whiskeys linked to an event.
 */
export function useWhiskeys(eventId: string) {
  return useQuery({
    queryKey: ['whiskeys', eventId],
    queryFn: () => eventWhiskeysApi.getByEvent(eventId),
    enabled: !!eventId,
  });
}

/**
 * Fetch a single whiskey as it appears in an event.
 */
export function useWhiskey(eventId: string, whiskeyId: string) {
  return useQuery({
    queryKey: ['whiskeys', eventId, whiskeyId],
    queryFn: () => eventWhiskeysApi.getByEventAndId(eventId, whiskeyId),
    enabled: !!eventId && !!whiskeyId,
  });
}

// Event-linked whiskeys mutations

/**
 * Add a whiskey to an event (link existing or create + link).
 */
export function useAddWhiskeyToEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, input }: { eventId: string; input: AddWhiskeyToEventInput }) =>
      eventWhiskeysApi.addToEvent(eventId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', variables.eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['events', variables.eventId],
      });
    },
  });
}

/**
 * Remove a whiskey from an event (delete link only).
 */
export function useRemoveWhiskeyFromEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, whiskeyId }: { eventId: string; whiskeyId: string }) =>
      eventWhiskeysApi.removeFromEvent(eventId, whiskeyId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', variables.eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['events', variables.eventId],
      });
    },
  });
}

/**
 * Update a catalog whiskey (globally editable).
 */
export function useUpdateWhiskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      whiskeyId,
      input,
    }: {
      whiskeyId: string;
      input: UpdateCatalogWhiskeyInput;
    }) => catalogWhiskeysApi.update(whiskeyId, input),
    onSuccess: () => {
      // Invalidate catalog
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', 'ranking'],
      });
      // Invalidate all event-linked whiskeys (safe broad invalidation)
      queryClient.invalidateQueries({
        queryKey: ['whiskeys'],
      });
    },
  });
}

// Catalog whiskeys queries

/**
 * Fetch all catalog whiskeys (ranking source).
 */
export function useAllWhiskeys(params?: { top?: number; skip?: number }) {
  return useQuery({
    queryKey: ['whiskeys', 'ranking', params],
    queryFn: () => catalogWhiskeysApi.getAll(params),
  });
}

/**
 * Fetch a single catalog whiskey.
 */
export function useCatalogWhiskey(whiskeyId: string) {
  return useQuery({
    queryKey: ['whiskeys', 'catalog', whiskeyId],
    queryFn: () => catalogWhiskeysApi.getById(whiskeyId),
    enabled: !!whiskeyId,
  });
}

// Catalog whiskeys mutations

/**
 * Create a new catalog whiskey.
 */
export function useCreateCatalogWhiskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCatalogWhiskeyInput) =>
      catalogWhiskeysApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', 'ranking'],
      });
    },
  });
}

/**
 * Delete a catalog whiskey.
 */
export function useDeleteCatalogWhiskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (whiskeyId: string) => catalogWhiskeysApi.delete(whiskeyId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', 'ranking'],
      });
    },
  });
}

export const useDeleteWhiskey = useRemoveWhiskeyFromEvent;
