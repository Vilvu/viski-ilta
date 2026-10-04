export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'taster' | 'user' | 'anonymous';
  // Identity provider: 'aad' (SWA / Entra ID) or 'local' (native account).
  provider?: string;
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
  distillery?: string;
  region?: string;
  age?: number;
  abv?: number;
  description?: string;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  globalAverageRating: number;
  globalRatingCount: number;
  imageUpdatedAt?: string; // set when the whiskey has a bottle photo
}

// Whiskey as linked to an event (joined with event-scoped aggregates)
export interface EventWhiskey {
  id: string;
  eventId: string;
  name: string;
  distillery?: string;
  region?: string;
  age?: number;
  abv?: number;
  description?: string;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  averageRating: number; // event-scoped
  ratingCount: number; // event-scoped
  userRating?: number;
  imageUpdatedAt?: string; // set when the whiskey has a bottle photo
}

// AI bottle recognition result; null means "not determined"
export interface RecognizedWhiskey {
  name: string | null;
  distillery: string | null;
  region: string | null;
  age: number | null;
  abv: number | null;
  description: string | null;
  sources: string[];
}

// App-managed role, sourced from the Cosmos `users` document (DB role).
// Distinct from the legacy SWA-derived `UserRole` below, which includes
// a 'user' value that the DB role never produces.
export type AppRole = 'anonymous' | 'taster' | 'admin';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  // 'local' = username/password account (its password can be reset).
  authProvider?: 'aad' | 'local';
  // Sign-in username of a 'local' account (they have no email).
  username?: string;
}

export interface TemporaryPassword {
  temporaryPassword: string;
  expiresAt: string;
}

export interface Rating {
  id: string;
  whiskeyId: string;
  eventId: string;
  userId: string;
  userName: string;
  score: number; // 0-10
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
