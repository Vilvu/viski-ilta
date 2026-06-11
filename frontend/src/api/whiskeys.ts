import { apiClient } from './client';
import type { Whiskey, ApiResponse } from '@/types';

export interface CreateWhiskeyInput {
  eventId: string;
  name: string;
  distillery: string;
  region: string;
  age?: number;
  abv?: number;
  description?: string;
}

export interface UpdateWhiskeyInput {
  eventId: string;
  whiskeyId: string;
  name?: string;
  distillery?: string;
  region?: string;
  age?: number;
  abv?: number;
  description?: string;
}

export const whiskeysApi = {
  getByEvent: async (eventId: string): Promise<Whiskey[]> => {
    const response = await apiClient.get<ApiResponse<Whiskey[]>>(
      `/events/${eventId}/whiskeys`,
    );
    return response.data.data;
  },

  getById: async (eventId: string, whiskeyId: string): Promise<Whiskey> => {
    const response = await apiClient.get<ApiResponse<Whiskey>>(
      `/events/${eventId}/whiskeys/${whiskeyId}`,
    );
    return response.data.data;
  },

  create: async (input: CreateWhiskeyInput): Promise<Whiskey> => {
    const { eventId, ...body } = input;
    const response = await apiClient.post<ApiResponse<Whiskey>>(
      `/events/${eventId}/whiskeys`,
      body,
    );
    return response.data.data;
  },

  delete: async ({
    eventId,
    whiskeyId,
  }: {
    eventId: string;
    whiskeyId: string;
  }): Promise<void> => {
    await apiClient.delete(`/events/${eventId}/whiskeys/${whiskeyId}`);
  },

  update: async ({ eventId, whiskeyId, ...body }: UpdateWhiskeyInput): Promise<Whiskey> => {
    const response = await apiClient.patch<ApiResponse<Whiskey>>(
      `/events/${eventId}/whiskeys/${whiskeyId}`,
      body,
    );
    return response.data.data;
  },
};
