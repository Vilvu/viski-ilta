import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { createTestQueryClient } from '../test/renderWithProviders';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdminUsers, useSetUserRole } from './useAdminUsers';

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

describe('useAdminUsers', () => {
  it('fetches the user list', async () => {
    server.use(
      http.get('/api/users', () =>
        HttpResponse.json({
          data: [
            {
              id: 'u1',
              email: 'a@example.com',
              displayName: 'A',
              role: 'admin',
            },
          ],
        }),
      ),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminUsers(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe('useSetUserRole', () => {
  it('invalidates both adminUsers and userProfile query keys on success', async () => {
    server.use(
      http.put('/api/users/u1/role', () =>
        HttpResponse.json({
          data: {
            id: 'u1',
            email: 'a@example.com',
            displayName: 'A',
            role: 'admin',
          },
        }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useSetUserRole(), { wrapper });
    result.current.mutate({ id: 'u1', role: 'admin' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adminUsers'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['userProfile'] });
  });
});
