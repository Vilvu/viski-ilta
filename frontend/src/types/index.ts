export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'taster' | 'user' | 'anonymous';
}

export interface Event {
  id: string;
  name: string;
  description: string;
  date: string;
  location?: string;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  whiskeyCount: number;
}

// Catalog whiskey (standalone, global catalog)
export interface CatalogWhiskey {
  id: string;
  name: string;
  distillery: string;
  region: string;
  age?: number;
  abv?: number;
  description?: string;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  globalAverageRating: number;
  globalRatingCount: number;
}

// Whiskey as linked to an event (joined with event-scoped aggregates)
export interface EventWhiskey {
  id: string;
  eventId: string;
  name: string;
  distillery: string;
  region: string;
  age?: number;
  abv?: number;
  description?: string;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  averageRating: number;  // event-scoped
  ratingCount: number;    // event-scoped
  userRating?: number;
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

export type UserRole = 'admin' | 'taster' | 'user' | 'anonymous';
