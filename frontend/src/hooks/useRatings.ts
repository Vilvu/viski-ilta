import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ratingsApi, type UpsertRatingInput } from '@/api/ratings';

/**
 * Fetch all ratings for a whiskey in a specific event.
 */
export function useRatings(eventId: string, whiskeyId: string) {
  return useQuery({
    queryKey: ['ratings', eventId, whiskeyId],
    queryFn: () => ratingsApi.getByEventWhiskey(eventId, whiskeyId),
    enabled: !!eventId && !!whiskeyId,
  });
}

/**
 * Upsert the authenticated user's rating for a whiskey in an event.
 */
export function useUpsertRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      whiskeyId,
      input,
    }: {
      eventId: string;
      whiskeyId: string;
      input: UpsertRatingInput;
    }) => ratingsApi.upsert(eventId, whiskeyId, input),
    onSuccess: (_data, variables) => {
      // Invalidate event-scoped ratings
      queryClient.invalidateQueries({
        queryKey: ['ratings', variables.eventId, variables.whiskeyId],
      });
      // Invalidate event-linked whiskeys (aggregates changed)
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', variables.eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', variables.eventId, variables.whiskeyId],
      });
      // Invalidate catalog ranking (global average changed)
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', 'ranking'],
      });
    },
  });
}

/**
 * Delete the authenticated user's rating for a whiskey in an event.
 */
export function useDeleteRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      whiskeyId,
    }: {
      eventId: string;
      whiskeyId: string;
    }) => ratingsApi.delete(eventId, whiskeyId),
    onSuccess: (_data, variables) => {
      // Invalidate event-scoped ratings
      queryClient.invalidateQueries({
        queryKey: ['ratings', variables.eventId, variables.whiskeyId],
      });
      // Invalidate event-linked whiskeys (aggregates changed)
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', variables.eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', variables.eventId, variables.whiskeyId],
      });
      // Invalidate catalog ranking (global average changed)
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', 'ranking'],
      });
    },
  });
}
