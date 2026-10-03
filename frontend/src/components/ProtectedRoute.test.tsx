import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import TasterRoute from './ProtectedRoute';

function renderRoute() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/events/:eventId/whiskeys/:whiskeyId"
        element={
          <TasterRoute>
            <div>Protected Content</div>
          </TasterRoute>
        }
      />
      <Route path="/events/:eventId" element={<div>Event Page</div>} />
    </Routes>,
    { route: '/events/e1/whiskeys/w1' },
  );
}

function mockAuth(role: 'anonymous' | 'taster' | 'admin') {
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
          role,
          usernameConfirmed: true,
        },
      }),
    ),
  );
}

describe('TasterRoute', () => {
  it('renders neither children nor a redirect while loading', () => {
    server.use(
      http.get('/.auth/me', () => new Promise(() => {})), // never resolves
    );
    renderRoute();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Event Page')).not.toBeInTheDocument();
  });

  it('redirects a non-taster to the event page', async () => {
    mockAuth('anonymous');
    renderRoute();
    await waitFor(() =>
      expect(screen.getByText('Event Page')).toBeInTheDocument(),
    );
  });

  it('renders children for a taster', async () => {
    mockAuth('taster');
    renderRoute();
    await waitFor(() =>
      expect(screen.getByText('Protected Content')).toBeInTheDocument(),
    );
  });

  it('renders children for an admin', async () => {
    mockAuth('admin');
    renderRoute();
    await waitFor(() =>
      expect(screen.getByText('Protected Content')).toBeInTheDocument(),
    );
  });
});
