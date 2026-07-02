import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/users';
import { useAuth } from './useAuth';

export function useUserProfile() {
  const { isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['userProfile'],
    queryFn: usersApi.getMe,
    enabled: isAuthenticated,
  });

  return {
    ...query,
    data: query.data,
    // GET /api/users/me now always ensures a doc exists (ensureUser), so the
    // profile is considered present as soon as the query has resolved.
    hasProfile: query.data !== undefined,
  };
}

export function useUpdateDisplayName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: usersApi.updateMe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });
}
