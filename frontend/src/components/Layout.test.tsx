import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import Layout from './Layout';

function renderLayout() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<div>Home</div>} />
      </Route>
    </Routes>,
    { route: '/' },
  );
}

function mockAnonymous() {
  server.use(
    http.get('/.auth/me', () => HttpResponse.json({ clientPrincipal: null })),
  );
}

function mockAuthenticated(
  role: 'anonymous' | 'taster' | 'admin',
  usernameConfirmed = true,
) {
  server.use(
    http.get('/.auth/me', () =>
      HttpResponse.json({
        clientPrincipal: {
          userId: 'u1',
          userRoles: ['authenticated'],
          claims: [{ typ: 'name', val: 'Ville' }],
          identityProvider: 'aad',
          userDetails: 'ville@example.com',
        },
      }),
    ),
    http.get('/api/users/me', () =>
      HttpResponse.json({
        data: {
          displayName: 'Ville',
          email: 'ville@example.com',
          role,
          usernameConfirmed,
        },
      }),
    ),
  );
}

describe('Layout navigation', () => {
  it('shows sign-in link and hides admin/user-management for anonymous visitors', async () => {
    mockAnonymous();
    renderLayout();
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /sign in/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.queryByText(/user management/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sign out/i }),
    ).not.toBeInTheDocument();
  });

  it('shows sign-out and hides user-management for a plain taster', async () => {
    mockAuthenticated('taster');
    renderLayout();
    await waitFor(() =>
      expect(screen.getByText(/sign out/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/user management/i)).not.toBeInTheDocument();
  });

  it('shows the user-management link for an admin', async () => {
    mockAuthenticated('admin');
    renderLayout();
    await waitFor(() =>
      expect(screen.getByText(/user management/i)).toBeInTheDocument(),
    );
  });

  it('renders UsernameSetupModal only when usernameConfirmed is false', async () => {
    mockAuthenticated('taster', false);
    renderLayout();
    await waitFor(() =>
      expect(screen.getByText(/choose display name/i)).toBeInTheDocument(),
    );
  });

  it('does not render UsernameSetupModal when usernameConfirmed is true', async () => {
    mockAuthenticated('taster', true);
    renderLayout();
    await waitFor(() =>
      expect(screen.getByText(/sign out/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/choose display name/i)).not.toBeInTheDocument();
  });

  describe('native (local) accounts', () => {
    const originalLocation = window.location;

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    });

    it('signs out through the API instead of /.auth/logout', async () => {
      const assign = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, assign },
        writable: true,
        configurable: true,
      });
      let loggedOut = false;
      server.use(
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
              role: 'anonymous',
              usernameConfirmed: true,
            },
          }),
        ),
        http.post('/api/auth/logout', () => {
          loggedOut = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      renderLayout();
      const signOut = await screen.findByText(/sign out/i);
      expect(screen.getAllByText('alice').length).toBeGreaterThan(0);

      await userEvent.click(signOut);

      await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
      expect(loggedOut).toBe(true);
    });
  });
});
