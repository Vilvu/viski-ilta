import { apiClient } from './client';
import type { ApiResponse, AdminUser, AppRole } from '@/types';

export interface UserProfile {
  displayName: string;
  email: string;
  role: AppRole;
  usernameConfirmed: boolean;
}

export const usersApi = {
  getMe: async (): Promise<UserProfile> => {
    const response = await apiClient.get<ApiResponse<UserProfile>>('/users/me');
    return response.data.data;
  },

  updateMe: async (displayName: string): Promise<UserProfile> => {
    const response = await apiClient.put<ApiResponse<UserProfile>>(
      '/users/me',
      { displayName },
    );
    return response.data.data;
  },

  listUsers: async (): Promise<AdminUser[]> => {
    const response = await apiClient.get<ApiResponse<AdminUser[]>>('/users');
    return response.data.data;
  },

  setUserRole: async (id: string, role: AppRole): Promise<AdminUser> => {
    const response = await apiClient.put<ApiResponse<AdminUser>>(
      `/users/${id}/role`,
      { role },
    );
    return response.data.data;
  },
};
