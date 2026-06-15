import { apiClient } from './client';
import type { ApiResponse } from '@/types';

export interface UserProfile {
  displayName: string;
}

export const usersApi = {
  getMe: async (): Promise<UserProfile | null> => {
    try {
      const response =
        await apiClient.get<ApiResponse<UserProfile>>('/users/me');
      return response.data.data;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error) {
        const err = error as { response?: { status?: number } };
        if (err.response?.status === 404) {
          return null;
        }
      }
      throw error;
    }
  },

  updateMe: async (displayName: string): Promise<UserProfile> => {
    const response = await apiClient.put<ApiResponse<UserProfile>>(
      '/users/me',
      { displayName },
    );
    return response.data.data;
  },
};
