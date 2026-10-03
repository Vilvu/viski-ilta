import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../i18n';

/**
 * A fresh QueryClient per test with retry/caching disabled. The app's real
 * client uses staleTime: 5min / retry: 1, which causes cross-test cache
 * bleed and timeout-prone failures if reused here.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderWithProvidersOptions {
  route?: string;
  queryClient?: QueryClient;
  language?: 'en' | 'fi';
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    queryClient,
    language = 'en',
  }: RenderWithProvidersOptions = {},
) {
  const client = queryClient ?? createTestQueryClient();
  void i18n.changeLanguage(language);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper }),
    queryClient: client,
  };
}
