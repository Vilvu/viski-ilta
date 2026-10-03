import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import AdminRoute from './AdminRoute';

function renderRoute() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <div>Admin Content</div>
          </AdminRoute>
        }
      />
      <Route path="/" element={<div>Home Page</div>} />
    </Routes>,
    { route: '/admin/users' },
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

describe('AdminRoute', () => {
  it('does not redirect prematurely while loading', () => {
    server.use(http.get('/.auth/me', () => new Promise(() => {})));
    renderRoute();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('redirects a non-admin to /', async () => {
    mockAuth('taster');
    renderRoute();
    await waitFor(() =>
      expect(screen.getByText('Home Page')).toBeInTheDocument(),
    );
  });

  it('renders children for an admin', async () => {
    mockAuth('admin');
    renderRoute();
    await waitFor(() =>
      expect(screen.getByText('Admin Content')).toBeInTheDocument(),
    );
  });
});
