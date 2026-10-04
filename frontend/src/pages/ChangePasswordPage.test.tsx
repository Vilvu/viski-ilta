import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import ChangePasswordPage from './ChangePasswordPage';

const originalLocation = window.location;
let assign: ReturnType<typeof vi.fn>;

const nativePrincipal = {
  userId: 'local:1',
  userRoles: ['authenticated'],
  claims: [{ typ: 'name', val: 'alice' }],
  identityProvider: 'local',
  userDetails: 'alice',
};

function mockSession(mustChangePassword: boolean) {
  server.use(
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        clientPrincipal: nativePrincipal,
        mustChangePassword,
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
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/login" element={<div>Login page</div>} />
    </Routes>,
    { route: '/change-password' },
  );
}

async function fill(current: string, next: string, confirm = next) {
  await userEvent.type(
    await screen.findByLabelText(/(current|temporary) password/i),
    current,
  );
  await userEvent.type(screen.getByLabelText(/^new password$/i), next);
  await userEvent.type(screen.getByLabelText(/confirm new password/i), confirm);
  await userEvent.click(
    screen.getByRole('button', { name: /change password/i }),
  );
}

beforeEach(() => {
  assign = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, assign },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

describe('ChangePasswordPage', () => {
  it('explains the forced change after an admin reset', async () => {
    mockSession(true);
    renderPage();
    expect(
      await screen.findByText(/your password was reset by an admin/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/temporary password/i)).toBeInTheDocument();
  });

  it('changes the password and reloads the app', async () => {
    mockSession(true);
    let body: unknown;
    server.use(
      http.post('/api/auth/change-password', async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();

    await fill('Temp1234abcd', 'brand-new-pass');

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(body).toEqual({
      currentPassword: 'Temp1234abcd',
      newPassword: 'brand-new-pass',
    });
  });

  it.each([
    ['too short', 'old-password', 'short', 'short', /at least 8/i],
    [
      'mismatched',
      'old-password',
      'brand-new-pass',
      'other-pass',
      /do not match/i,
    ],
    [
      'unchanged',
      'same-password',
      'same-password',
      'same-password',
      /must be different/i,
    ],
  ])(
    'validates a %s new password before calling the API',
    async (_label, current, next, confirm, message) => {
      mockSession(false);
      renderPage();
      await fill(current, next, confirm);
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it('reports a wrong current password', async () => {
    mockSession(false);
    server.use(
      http.post('/api/auth/change-password', () =>
        HttpResponse.json(
          { message: 'Current password is incorrect' },
          { status: 400 },
        ),
      ),
    );
    renderPage();

    await fill('wrong-password', 'brand-new-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /current password is incorrect/i,
    );
  });

  it('explains a lockout after too many wrong current passwords', async () => {
    mockSession(false);
    server.use(
      http.post('/api/auth/change-password', () =>
        HttpResponse.json(
          { message: 'Too many failed sign-in attempts. Try again later.' },
          { status: 429 },
        ),
      ),
    );
    renderPage();

    await fill('wrong-password', 'brand-new-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /too many failed attempts/i,
    );
  });

  it('explains an expired temporary password instead of redirecting', async () => {
    mockSession(true);
    server.use(
      http.post('/api/auth/change-password', () =>
        HttpResponse.json(
          {
            message:
              'Temporary password has expired. Ask an admin to reset it again.',
          },
          { status: 401 },
        ),
      ),
    );
    renderPage();

    await fill('Temp1234abcd', 'brand-new-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /temporary password has expired/i,
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('sends the user to sign in if their session is gone', async () => {
    mockSession(false);
    server.use(
      http.post(
        '/api/auth/change-password',
        () => new HttpResponse(null, { status: 401 }),
      ),
    );
    renderPage();

    await fill('old-password', 'brand-new-pass');

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
  });

  it('redirects anonymous visitors to the login page', async () => {
    renderPage();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });
});
