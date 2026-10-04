import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import LoginPage from './LoginPage';

const originalLocation = window.location;
let assign: ReturnType<typeof vi.fn>;

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

const profile = {
  displayName: 'alice',
  email: '',
  role: 'anonymous',
  usernameConfirmed: true,
};

async function fillSignIn(username: string, password: string) {
  await userEvent.type(screen.getByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/^password$/i), password);
  await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
}

async function switchToRegister() {
  await userEvent.click(screen.getByRole('button', { name: /create one/i }));
}

describe('LoginPage — sign in', () => {
  it('signs in and reloads the app on success', async () => {
    let body: unknown;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: profile });
      }),
    );
    renderWithProviders(<LoginPage />, { route: '/login' });

    await fillSignIn('alice', 'correct-horse');

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(body).toEqual({ username: 'alice', password: 'correct-horse' });
  });

  it('shows an inline error for bad credentials without redirecting', async () => {
    server.use(
      http.post(
        '/api/auth/login',
        () => new HttpResponse(null, { status: 401 }),
      ),
    );
    renderWithProviders(<LoginPage />, { route: '/login' });

    await fillSignIn('alice', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /invalid username or password/i,
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows the lockout message on 429', async () => {
    server.use(
      http.post(
        '/api/auth/login',
        () => new HttpResponse(null, { status: 429 }),
      ),
    );
    renderWithProviders(<LoginPage />, { route: '/login' });

    await fillSignIn('alice', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /too many failed attempts/i,
    );
  });

  it('offers Microsoft sign-in', () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    expect(
      screen.getByRole('link', { name: /sign in with microsoft/i }),
    ).toHaveAttribute('href', '/.auth/login/aad');
  });
});

describe('LoginPage — create account', () => {
  async function fillRegister(
    username: string,
    password: string,
    confirm = password,
  ) {
    await switchToRegister();
    await userEvent.type(screen.getByLabelText(/username/i), username);
    await userEvent.type(screen.getByLabelText(/^password$/i), password);
    await userEvent.type(screen.getByLabelText(/confirm password/i), confirm);
    await userEvent.click(
      screen.getByRole('button', { name: /^create account$/i }),
    );
  }

  it('registers and reloads the app on success', async () => {
    let body: unknown;
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: profile }, { status: 201 });
      }),
    );
    renderWithProviders(<LoginPage />, { route: '/login' });

    await fillRegister('alice', 'correct-horse');

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(body).toEqual({ username: 'alice', password: 'correct-horse' });
  });

  it.each([
    ['an invalid username', 'a!', 'correct-horse', 'correct-horse', /3–32/],
    ['a short password', 'alice', 'short', 'short', /at least 8/i],
    [
      'mismatched passwords',
      'alice',
      'correct-horse',
      'other-horse',
      /do not match/i,
    ],
  ])(
    'validates %s before calling the API',
    async (_label, username, password, confirm, message) => {
      renderWithProviders(<LoginPage />, { route: '/login' });
      await fillRegister(username, password, confirm);
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it('reports a taken username', async () => {
    server.use(
      http.post(
        '/api/auth/register',
        () => new HttpResponse(null, { status: 409 }),
      ),
    );
    renderWithProviders(<LoginPage />, { route: '/login' });

    await fillRegister('alice', 'correct-horse');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /already taken/i,
    );
  });

  it('switches back to sign in', async () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    await switchToRegister();
    await userEvent.click(
      screen.getByRole('button', { name: /already have an account/i }),
    );
    expect(
      screen.queryByLabelText(/confirm password/i),
    ).not.toBeInTheDocument();
  });
});
