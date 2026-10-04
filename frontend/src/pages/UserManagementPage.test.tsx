import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import UserManagementPage from './UserManagementPage';

const users = [
  {
    id: 'admin1',
    email: 'admin@example.com',
    displayName: 'Admin',
    role: 'admin',
  },
  { id: 'local:abc', email: '', displayName: 'Alice', role: 'taster' },
];

let deletedIds: string[];

beforeEach(() => {
  deletedIds = [];
  server.use(
    http.get('/.auth/me', () =>
      HttpResponse.json({
        clientPrincipal: {
          userId: 'admin1',
          userRoles: ['authenticated'],
          claims: [{ typ: 'name', val: 'Admin' }],
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
    http.get('/api/users', () =>
      HttpResponse.json({
        data: users.filter((u) => !deletedIds.includes(u.id)),
      }),
    ),
    http.delete('/api/users/:id', ({ params }) => {
      deletedIds.push(decodeURIComponent(params.id as string));
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function rowFor(name: string) {
  const cell = await screen.findByText(name);
  return cell.closest('tr') as HTMLElement;
}

async function removeButtonFor(name: string) {
  // Wait for useAuth to resolve so the self-row guard is in effect.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Remove Admin' })).toBeDisabled(),
  );
  return within(await rowFor(name)).getByRole('button', { name: /remove/i });
}

describe('UserManagementPage — removing users', () => {
  it('removes a user after confirmation and refreshes the list', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<UserManagementPage />, { route: '/admin/users' });

    await userEvent.click(await removeButtonFor('Alice'));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Alice'));
    await waitFor(() =>
      expect(screen.queryByText('Alice')).not.toBeInTheDocument(),
    );
    expect(deletedIds).toEqual(['local:abc']);
  });

  it('does nothing when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProviders(<UserManagementPage />, { route: '/admin/users' });

    await userEvent.click(await removeButtonFor('Alice'));

    expect(deletedIds).toEqual([]);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('does not let an admin remove themselves', async () => {
    renderWithProviders(<UserManagementPage />, { route: '/admin/users' });
    await removeButtonFor('Alice');
    expect(
      screen.getByRole('button', { name: 'Remove Admin' }),
    ).toHaveAttribute('title', 'You cannot remove yourself');
  });

  it('shows the server error message when removal fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    server.use(
      http.delete('/api/users/:id', () =>
        HttpResponse.json(
          { message: 'User not found', statusCode: 404 },
          { status: 404 },
        ),
      ),
    );
    renderWithProviders(<UserManagementPage />, { route: '/admin/users' });

    await userEvent.click(await removeButtonFor('Alice'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('User not found'),
    );
  });
});

describe('UserManagementPage — roles', () => {
  it('changes a role after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let body: unknown;
    server.use(
      http.put('/api/users/:id/role', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...users[1], role: 'admin' } });
      }),
    );
    renderWithProviders(<UserManagementPage />, { route: '/admin/users' });
    await removeButtonFor('Alice');

    await userEvent.selectOptions(
      within(await rowFor('Alice')).getByRole('combobox'),
      'admin',
    );

    await waitFor(() => expect(body).toEqual({ role: 'admin' }));
  });
});
