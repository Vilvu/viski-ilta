import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { usersApi } from './users';

describe('usersApi', () => {
  it('getMe: GET /users/me', async () => {
    server.use(
      http.get('/api/users/me', () =>
        HttpResponse.json({
          data: {
            displayName: 'Alice',
            email: 'alice@example.com',
            role: 'taster',
            usernameConfirmed: true,
          },
        }),
      ),
    );
    const result = await usersApi.getMe();
    expect(result.displayName).toBe('Alice');
  });

  it('updateMe: PUT /users/me with { displayName }', async () => {
    let capturedBody: unknown;
    server.use(
      http.put('/api/users/me', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          data: {
            displayName: 'New Name',
            email: 'a@example.com',
            role: 'taster',
            usernameConfirmed: true,
          },
        });
      }),
    );
    const result = await usersApi.updateMe('New Name');
    expect(capturedBody).toEqual({ displayName: 'New Name' });
    expect(result.displayName).toBe('New Name');
  });

  it('listUsers: GET /users', async () => {
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
    const result = await usersApi.listUsers();
    expect(result).toHaveLength(1);
  });

  it('deleteUser: DELETE /users/:id with the id URL-encoded', async () => {
    let calledPath = '';
    server.use(
      http.delete('/api/users/:id', ({ request }) => {
        calledPath = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await usersApi.deleteUser('local:abc');
    expect(calledPath).toBe('/api/users/local%3Aabc');
  });

  it('resetPassword: POST /users/:id/reset-password', async () => {
    let calledPath = '';
    server.use(
      http.post('/api/users/:id/reset-password', ({ request }) => {
        calledPath = new URL(request.url).pathname;
        return HttpResponse.json({
          data: {
            temporaryPassword: 'Abcd2345efgh',
            expiresAt: '2026-10-05T12:00:00Z',
          },
        });
      }),
    );
    const result = await usersApi.resetPassword('local:abc');
    expect(calledPath).toBe('/api/users/local%3Aabc/reset-password');
    expect(result.temporaryPassword).toBe('Abcd2345efgh');
  });

  it('setUserRole: PUT /users/:id/role with { role }', async () => {
    let capturedBody: unknown;
    server.use(
      http.put('/api/users/u1/role', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          data: {
            id: 'u1',
            email: 'a@example.com',
            displayName: 'A',
            role: 'admin',
          },
        });
      }),
    );
    const result = await usersApi.setUserRole('u1', 'admin');
    expect(capturedBody).toEqual({ role: 'admin' });
    expect(result.role).toBe('admin');
  });
});
