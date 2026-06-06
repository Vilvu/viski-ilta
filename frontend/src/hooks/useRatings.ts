import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ratingsApi } from '@/api/ratings';

export function useRatings(whiskeyId: string) {
  return useQuery({
    queryKey: ['ratings', whiskeyId],
    queryFn: () => ratingsApi.getByWhiskey(whiskeyId),
    enabled: !!whiskeyId,
  });
}

export function useUpsertRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ratingsApi.upsert,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ratings', variables.whiskeyId],
      });
      queryClient.invalidateQueries({ queryKey: ['whiskeys'] });
    },
  });
}

export function useDeleteRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ratingsApi.delete,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ratings', variables.whiskeyId],
      });
      queryClient.invalidateQueries({ queryKey: ['whiskeys'] });
    },
  });
}
