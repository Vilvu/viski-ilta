import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/users';
import type { AppRole } from '@/types';

export function useAdminUsers() {
  return useQuery({
    queryKey: ['adminUsers'],
    queryFn: usersApi.listUsers,
  });
}

export function useSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: AppRole }) =>
      usersApi.setUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      // The acting admin's own role may have changed (though self-demotion
      // is blocked server-side) — refresh the profile used by useAuth too.
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });
}
