import { apiClient } from './client';
import type { ApiResponse } from '@/types';
import type { UserProfile } from './users';

/** Same shape as SWA's /.auth/me clientPrincipal. */
export interface ClientPrincipal {
  userId: string;
  userRoles: string[];
  claims: Array<{ typ: string; val: string }>;
  identityProvider: string;
  userDetails: string;
}

export interface Credentials {
  username: string;
  password: string;
}

/** Native username/password accounts (app-managed session cookie). */
export const authApi = {
  register: async (credentials: Credentials): Promise<UserProfile> => {
    const response = await apiClient.post<ApiResponse<UserProfile>>(
      '/auth/register',
      credentials,
    );
    return response.data.data;
  },

  login: async (credentials: Credentials): Promise<UserProfile> => {
    const response = await apiClient.post<ApiResponse<UserProfile>>(
      '/auth/login',
      credentials,
    );
    return response.data.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  getSession: async (): Promise<ClientPrincipal | null> => {
    const response = await apiClient.get<{
      clientPrincipal: ClientPrincipal | null;
    }>('/auth/me');
    return response.data.clientPrincipal;
  },
};
