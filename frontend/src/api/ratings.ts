import { apiClient } from './client';
import type { Rating, ApiResponse } from '@/types';

export interface UpsertRatingInput {
  whiskeyId: string;
  eventId: string;
  score: number;
  notes?: string;
}

export const ratingsApi = {
  getByWhiskey: async (whiskeyId: string): Promise<Rating[]> => {
    const response = await apiClient.get<ApiResponse<Rating[]>>(
      `/whiskeys/${whiskeyId}/ratings`,
    );
    return response.data.data;
  },

  upsert: async (input: UpsertRatingInput): Promise<Rating> => {
    const { whiskeyId, ...body } = input;
    const response = await apiClient.put<ApiResponse<Rating>>(
      `/whiskeys/${whiskeyId}/ratings/me`,
      body,
    );
    return response.data.data;
  },

  delete: async ({ whiskeyId }: { whiskeyId: string }): Promise<void> => {
    await apiClient.delete(`/whiskeys/${whiskeyId}/ratings/me`);
  },
};
