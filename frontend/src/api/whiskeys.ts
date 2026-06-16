import { apiClient } from './client';
import type { CatalogWhiskey, EventWhiskey, ApiResponse } from '@/types';

// Input types for create/update operations
export interface CreateCatalogWhiskeyInput {
  name: string;
  distillery: string;
  region: string;
  age?: number;
  abv?: number;
  description?: string;
}

export interface UpdateCatalogWhiskeyInput {
  name?: string;
  distillery?: string;
  region?: string;
  age?: number;
  abv?: number;
  description?: string;
}

// Input for adding a whiskey to an event: either link existing or create + link
export type AddWhiskeyToEventInput =
  | { whiskeyId: string }
  | (CreateCatalogWhiskeyInput & { whiskeyId?: undefined });

// Catalog whiskeys API (global catalog)
export const catalogWhiskeysApi = {
  /**
   * GET /api/whiskeys
   * List all catalog whiskeys ordered by global average rating.
   */
  getAll: async (params?: {
    top?: number;
    skip?: number;
  }): Promise<CatalogWhiskey[]> => {
    const queryParams = new URLSearchParams();
    if (params?.top !== undefined)
      queryParams.append('top', params.top.toString());
    if (params?.skip !== undefined)
      queryParams.append('skip', params.skip.toString());

    const response = await apiClient.get<ApiResponse<CatalogWhiskey[]>>(
      `/whiskeys${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
    );
    return response.data.data;
  },

  /**
   * GET /api/whiskeys/{whiskeyId}
   * Get a single catalog whiskey.
   */
  getById: async (whiskeyId: string): Promise<CatalogWhiskey> => {
    const response = await apiClient.get<ApiResponse<CatalogWhiskey>>(
      `/whiskeys/${whiskeyId}`,
    );
    return response.data.data;
  },

  /**
   * POST /api/whiskeys
   * Create a new catalog whiskey.
   */
  create: async (
    input: CreateCatalogWhiskeyInput,
  ): Promise<CatalogWhiskey> => {
    const response = await apiClient.post<ApiResponse<CatalogWhiskey>>(
      '/whiskeys',
      input,
    );
    return response.data.data;
  },

  /**
   * PATCH /api/whiskeys/{whiskeyId}
   * Update a catalog whiskey.
   */
  update: async (
    whiskeyId: string,
    input: UpdateCatalogWhiskeyInput,
  ): Promise<CatalogWhiskey> => {
    const response = await apiClient.patch<ApiResponse<CatalogWhiskey>>(
      `/whiskeys/${whiskeyId}`,
      input,
    );
    return response.data.data;
  },

  /**
   * DELETE /api/whiskeys/{whiskeyId}
   * Delete a catalog whiskey (only if not linked to any event).
   */
  delete: async (whiskeyId: string): Promise<void> => {
    await apiClient.delete(`/whiskeys/${whiskeyId}`);
  },
};

// Event-linked whiskeys API
export const eventWhiskeysApi = {
  /**
   * GET /api/events/{eventId}/whiskeys
   * List whiskeys linked to an event with event-scoped aggregates.
   */
  getByEvent: async (eventId: string): Promise<EventWhiskey[]> => {
    const response = await apiClient.get<ApiResponse<EventWhiskey[]>>(
      `/events/${eventId}/whiskeys`,
    );
    return response.data.data;
  },

  /**
   * GET /api/events/{eventId}/whiskeys/{whiskeyId}
   * Get a single whiskey as it appears in an event.
   */
  getByEventAndId: async (
    eventId: string,
    whiskeyId: string,
  ): Promise<EventWhiskey> => {
    const response = await apiClient.get<ApiResponse<EventWhiskey>>(
      `/events/${eventId}/whiskeys/${whiskeyId}`,
    );
    return response.data.data;
  },

  /**
   * POST /api/events/{eventId}/whiskeys
   * Add a whiskey to an event (link existing or create + link).
   */
  addToEvent: async (
    eventId: string,
    input: AddWhiskeyToEventInput,
  ): Promise<EventWhiskey> => {
    const response = await apiClient.post<ApiResponse<EventWhiskey>>(
      `/events/${eventId}/whiskeys`,
      input,
    );
    return response.data.data;
  },

  /**
   * DELETE /api/events/{eventId}/whiskeys/{whiskeyId}
   * Remove a whiskey from an event (delete link only).
   */
  removeFromEvent: async (
    eventId: string,
    whiskeyId: string,
  ): Promise<void> => {
    await apiClient.delete(`/events/${eventId}/whiskeys/${whiskeyId}`);
  },
};

// Legacy input type aliases for backward compatibility
export type CreateWhiskeyInput = CreateCatalogWhiskeyInput & { eventId: string };
export type UpdateWhiskeyInput = UpdateCatalogWhiskeyInput & {
  eventId: string;
  whiskeyId: string;
};
