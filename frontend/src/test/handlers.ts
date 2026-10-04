import { http, HttpResponse } from 'msw';

/**
 * Default MSW handlers. Every test starts anonymous/empty; override with
 * `server.use(...)` in individual tests for authenticated or populated
 * scenarios. onUnhandledRequest is 'error' (see setup.ts), so any request a
 * test forgets to stub fails loudly instead of hanging.
 */
export const handlers = [
  http.get('/.auth/me', () => HttpResponse.json({ clientPrincipal: null })),
  http.get('/api/auth/me', () => HttpResponse.json({ clientPrincipal: null })),

  http.get('/api/users/me', () =>
    HttpResponse.json({
      data: {
        displayName: 'Anonymous',
        email: '',
        role: 'anonymous',
        usernameConfirmed: true,
      },
    }),
  ),

  http.get('/api/events', () => HttpResponse.json({ data: [] })),
  http.get('/api/whiskeys', () => HttpResponse.json({ data: [] })),
  http.get('/api/users', () => HttpResponse.json({ data: [] })),
];
