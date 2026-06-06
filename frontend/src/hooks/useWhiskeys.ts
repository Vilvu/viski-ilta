import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { whiskeysApi } from '@/api/whiskeys';

export function useWhiskeys(eventId: string) {
  return useQuery({
    queryKey: ['whiskeys', eventId],
    queryFn: () => whiskeysApi.getByEvent(eventId),
    enabled: !!eventId,
  });
}

export function useWhiskey(eventId: string, whiskeyId: string) {
  return useQuery({
    queryKey: ['whiskeys', eventId, whiskeyId],
    queryFn: () => whiskeysApi.getById(eventId, whiskeyId),
    enabled: !!eventId && !!whiskeyId,
  });
}

export function useCreateWhiskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: whiskeysApi.create,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', variables.eventId],
      });
    },
  });
}

export function useDeleteWhiskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: whiskeysApi.delete,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['whiskeys', variables.eventId],
      });
    },
  });
}
