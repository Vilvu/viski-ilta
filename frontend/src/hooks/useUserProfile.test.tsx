import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { createTestQueryClient } from '../test/renderWithProviders';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUserProfile, useUpdateDisplayName } from './useUserProfile';

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

describe('useUserProfile', () => {
  it('does not fetch while unauthenticated', async () => {
    server.use(
      http.get('/.auth/me', () => HttpResponse.json({ clientPrincipal: null })),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserProfile(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.needsUsernameSetup).toBe(false);
  });

  it('flags needsUsernameSetup when usernameConfirmed is false', async () => {
    server.use(
      http.get('/.auth/me', () =>
        HttpResponse.json({
          clientPrincipal: {
            userId: 'u1',
            userRoles: ['authenticated'],
            claims: [],
            identityProvider: 'aad',
            userDetails: 'user@example.com',
          },
        }),
      ),
      http.get('/api/users/me', () =>
        HttpResponse.json({
          data: {
            displayName: 'User',
            email: 'user@example.com',
            role: 'anonymous',
            usernameConfirmed: false,
          },
        }),
      ),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserProfile(), { wrapper });
    await waitFor(() => expect(result.current.needsUsernameSetup).toBe(true));
  });
});

describe('useUpdateDisplayName', () => {
  it('invalidates the userProfile query key on success', async () => {
    server.use(
      http.put('/api/users/me', () =>
        HttpResponse.json({
          data: {
            displayName: 'New Name',
            email: 'user@example.com',
            role: 'taster',
            usernameConfirmed: true,
          },
        }),
      ),
    );
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useUpdateDisplayName(), { wrapper });
    result.current.mutate('New Name');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['userProfile'] });
  });
});
