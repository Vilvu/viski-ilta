import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { server } from '../test/server';
import { http, HttpResponse } from 'msw';

describe('apiClient', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults baseURL to /api when VITE_API_BASE_URL is unset', async () => {
    const { apiClient } = await import('./client');
    expect(apiClient.defaults.baseURL).toBe('/api');
  });

  it('honors VITE_API_BASE_URL when set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.com/api');
    vi.resetModules();
    const { apiClient } = await import('./client');
    expect(apiClient.defaults.baseURL).toBe('https://example.com/api');
  });
});

describe('apiClient 401 interceptor', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // jsdom does not implement navigation, and axios/MSW need a resolvable
    // base URL to build absolute request URLs from a relative baseURL, so
    // the stub must keep a valid href rather than blanking it — only the
    // final assigned value (asserted below) matters for this test.
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/',
        origin: 'http://localhost:3000',
        protocol: 'http:',
        host: 'localhost:3000',
        hostname: 'localhost',
        port: '',
        pathname: '/',
        search: '',
        hash: '',
        assign: vi.fn(),
        replace: vi.fn(),
        reload: vi.fn(),
      },
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
    vi.resetModules();
  });

  it('redirects to /login on a 401 response', async () => {
    server.use(
      http.get('/api/protected', () => new HttpResponse(null, { status: 401 })),
    );
    const { apiClient } = await import('./client');

    await expect(apiClient.get('/protected')).rejects.toBeTruthy();
    expect(window.location.href).toBe('/login');
  });

  it('does not redirect on a 401 from the native sign-in endpoints', async () => {
    server.use(
      http.post(
        '/api/auth/login',
        () => new HttpResponse(null, { status: 401 }),
      ),
    );
    const { apiClient } = await import('./client');

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(window.location.href).toBe('http://localhost:3000/');
  });

  it('propagates non-401 errors unchanged without redirecting', async () => {
    server.use(
      http.get('/api/broken', () => new HttpResponse(null, { status: 500 })),
    );
    const { apiClient } = await import('./client');

    await expect(apiClient.get('/broken')).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(window.location.href).toBe('http://localhost:3000/');
  });
});
