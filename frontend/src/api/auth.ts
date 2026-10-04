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

/**
 * A native session that signed in with an admin-issued temporary password
 * is restricted: the API treats it as signed out everywhere except
 * POST /auth/change-password until the password is changed.
 */
export interface NativeSession {
  clientPrincipal: ClientPrincipal | null;
  mustChangePassword: boolean;
}

export interface LoginResult extends UserProfile {
  mustChangePassword?: boolean;
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

  login: async (credentials: Credentials): Promise<LoginResult> => {
    const response = await apiClient.post<ApiResponse<LoginResult>>(
      '/auth/login',
      credentials,
    );
    return response.data.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  getSession: async (): Promise<NativeSession> => {
    const response = await apiClient.get<NativeSession>('/auth/me');
    return {
      clientPrincipal: response.data.clientPrincipal,
      mustChangePassword: response.data.mustChangePassword === true,
    };
  },

  changePassword: async (
    currentPassword: string,
    newPassword: string,
  ): Promise<void> => {
    await apiClient.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
  },
};
