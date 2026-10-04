import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { createTestQueryClient } from '../test/renderWithProviders';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('useAuth', () => {
  it('resolves anonymous with isAdmin/isTaster false when clientPrincipal is null', async () => {
    server.use(
      http.get('/.auth/me', () => HttpResponse.json({ clientPrincipal: null })),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isTaster).toBe(false);
  });

  it('retries once when userDetails comes back masked, then resolves', async () => {
    let callCount = 0;
    server.use(
      http.get('/.auth/me', () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json({
            clientPrincipal: {
              userId: 'u1',
              userRoles: ['authenticated'],
              claims: [{ typ: 'name', val: 'vil*****' }],
              identityProvider: 'aad',
              userDetails: 'vil*****',
            },
          });
        }
        return HttpResponse.json({
          clientPrincipal: {
            userId: 'u1',
            userRoles: ['authenticated'],
            claims: [{ typ: 'name', val: 'Ville' }],
            identityProvider: 'aad',
            userDetails: 'ville@example.com',
          },
        });
      }),
      http.get('/api/users/me', () =>
        HttpResponse.json({
          data: {
            displayName: 'Ville',
            email: 'ville@example.com',
            role: 'anonymous',
            usernameConfirmed: true,
          },
        }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false), {
      timeout: 3000,
    });
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.name).toBe('Ville');
  });

  it('resolves neither isAdmin nor isTaster for an anonymous DB role', async () => {
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
            usernameConfirmed: true,
          },
        }),
      ),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isTaster).toBe(false);
  });

  it('resolves isTaster only for a taster DB role', async () => {
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
            role: 'taster',
            usernameConfirmed: true,
          },
        }),
      ),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isTaster).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });

  it('resolves both isAdmin and isTaster true for an admin DB role', async () => {
    server.use(
      http.get('/.auth/me', () =>
        HttpResponse.json({
          clientPrincipal: {
            userId: 'u1',
            userRoles: ['authenticated'],
            claims: [],
            identityProvider: 'aad',
            userDetails: 'admin@example.com',
          },
        }),
      ),
      http.get('/api/users/me', () =>
        HttpResponse.json({
          data: {
            displayName: 'Admin',
            email: 'admin@example.com',
            role: 'admin',
            usernameConfirmed: true,
          },
        }),
      ),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isTaster).toBe(true);
  });

  it('falls back to non-privileged defaults without an unhandled rejection when /api/users/me fails', async () => {
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
      http.get('/api/users/me', () => new HttpResponse(null, { status: 500 })),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isTaster).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('falls back to the native session when SWA reports no principal', async () => {
    server.use(
      http.get('/.auth/me', () => HttpResponse.json({ clientPrincipal: null })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          clientPrincipal: {
            userId: 'local:1',
            userRoles: ['authenticated'],
            claims: [{ typ: 'name', val: 'alice' }],
            identityProvider: 'local',
            userDetails: 'alice',
          },
        }),
      ),
      http.get('/api/users/me', () =>
        HttpResponse.json({
          data: {
            displayName: 'alice',
            email: '',
            role: 'taster',
            usernameConfirmed: true,
          },
        }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isTaster).toBe(true);
    expect(result.current.user).toMatchObject({
      id: 'local:1',
      name: 'alice',
      email: '',
      provider: 'local',
    });
  });

  it('falls back to the native session when /.auth/me is unavailable', async () => {
    server.use(
      http.get(
        '/.auth/me',
        () => new HttpResponse('not json', { status: 404 }),
      ),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ clientPrincipal: null }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('resolves anonymous when the native session check fails', async () => {
    server.use(
      http.get('/.auth/me', () => HttpResponse.json({ clientPrincipal: null })),
      http.get('/api/auth/me', () => new HttpResponse(null, { status: 500 })),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('treats a must-change-password session as not signed in', async () => {
    let profileRequested = false;
    server.use(
      http.get('/.auth/me', () => HttpResponse.json({ clientPrincipal: null })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          clientPrincipal: {
            userId: 'local:1',
            userRoles: ['authenticated'],
            claims: [{ typ: 'name', val: 'alice' }],
            identityProvider: 'local',
            userDetails: 'alice',
          },
          mustChangePassword: true,
        }),
      ),
      http.get('/api/users/me', () => {
        profileRequested = true;
        return HttpResponse.json({ data: {} });
      }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mustChangePassword).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user?.name).toBe('alice');
    expect(profileRequested).toBe(false);
  });
});
