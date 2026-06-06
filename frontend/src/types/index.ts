export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'anonymous';
}

export interface Event {
  id: string;
  name: string;
  description: string;
  date: string;
  location: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  whiskeyCount: number;
}

export interface Whiskey {
  id: string;
  eventId: string;
  name: string;
  distillery: string;
  region: string;
  age?: number;
  abv?: number;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  averageRating: number;
  ratingCount: number;
  userRating?: number; // current user's rating, if authenticated
}

export interface Rating {
  id: string;
  whiskeyId: string;
  eventId: string;
  userId: string;
  userName: string;
  score: number; // 1-10
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type UserRole = 'admin' | 'user' | 'anonymous';
