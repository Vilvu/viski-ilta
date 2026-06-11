import { apiClient } from './client';
import type { Event, ApiResponse } from '@/types';

export interface CreateEventInput {
  name: string;
  description: string;
  date: string;
  location: string;
}

export interface UpdateEventInput {
  name?: string;
  description?: string;
  date?: string;
  location?: string;
}

export const eventsApi = {
  getAll: async (): Promise<Event[]> => {
    const response = await apiClient.get<ApiResponse<Event[]>>('/events');
    return response.data.data;
  },

  getById: async (id: string): Promise<Event> => {
    const response = await apiClient.get<ApiResponse<Event>>(`/events/${id}`);
    return response.data.data;
  },

  create: async (input: CreateEventInput): Promise<Event> => {
    const response = await apiClient.post<ApiResponse<Event>>('/events', input);
    return response.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/events/${id}`);
  },

  update: async (id: string, input: UpdateEventInput): Promise<Event> => {
    const response = await apiClient.patch<ApiResponse<Event>>(`/events/${id}`, input);
    return response.data.data;
  },
};
