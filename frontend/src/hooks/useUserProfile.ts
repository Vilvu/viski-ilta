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
    // True once the user has explicitly confirmed/saved a display name.
    // Auto-provisioned docs (first sign-in) start unconfirmed, which is what
    // drives the username setup prompt in Layout.tsx.
    needsUsernameSetup:
      query.data !== undefined && query.data.usernameConfirmed === false,
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
