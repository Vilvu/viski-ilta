import { apiClient } from './client';
import type { Rating, ApiResponse } from '@/types';

// Input type for upserting a rating
export interface UpsertRatingInput {
  score: number;
  notes?: string;
}

export const ratingsApi = {
  /**
   * GET /api/events/{eventId}/whiskeys/{whiskeyId}/ratings
   * List all ratings for a whiskey in a specific event.
   */
  getByEventWhiskey: async (
    eventId: string,
    whiskeyId: string,
  ): Promise<Rating[]> => {
    const response = await apiClient.get<ApiResponse<Rating[]>>(
      `/events/${eventId}/whiskeys/${whiskeyId}/ratings`,
    );
    return response.data.data;
  },

  /**
   * GET /api/whiskeys/{whiskeyId}/ratings
   * List all ratings for a catalog whiskey.
   */
  getByWhiskey: async (whiskeyId: string): Promise<Rating[]> => {
    const response = await apiClient.get<ApiResponse<Rating[]>>(
      `/whiskeys/${whiskeyId}/ratings`,
    );
    return response.data.data;
  },

  /**
   * PUT /api/events/{eventId}/whiskeys/{whiskeyId}/ratings/me
   * Upsert the authenticated user's rating for a whiskey in an event.
   */
  upsert: async (
    eventId: string,
    whiskeyId: string,
    input: UpsertRatingInput,
  ): Promise<Rating> => {
    const response = await apiClient.put<ApiResponse<Rating>>(
      `/events/${eventId}/whiskeys/${whiskeyId}/ratings/me`,
      input,
    );
    return response.data.data;
  },

  /**
   * DELETE /api/events/{eventId}/whiskeys/{whiskeyId}/ratings/me
   * Delete the authenticated user's rating for a whiskey in an event.
   */
  delete: async (eventId: string, whiskeyId: string): Promise<void> => {
    await apiClient.delete(
      `/events/${eventId}/whiskeys/${whiskeyId}/ratings/me`,
    );
  },
};
