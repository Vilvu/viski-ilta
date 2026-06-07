# WhiskyApp — Technical Specification

## 1. Data Models

### 1.1 Event

```typescript
interface Event {
  id: string;            // UUID — partition key
  name: string;          // Event name — e.g. "Spring Tasting 2026"
  date: string;          // ISO 8601 date — e.g. "2026-05-20"
  createdAt: string;     // ISO 8601 datetime
  updatedAt: string;     // ISO 8601 datetime
  createdBy: string;     // User ID of the admin who created it
  whiskeyCount: number;  // Denormalized count of whiskeys
  type: "event";         // Discriminator for queries
}
```

### 1.2 Whiskey

```typescript
interface Whiskey {
  id: string;            // UUID
  eventId: string;       // Foreign key to Event — partition key
  name: string;          // Whiskey name — e.g. "Lagavulin 16"
  distillery: string;    // Distillery name — e.g. "Lagavulin"
  age: number | null;    // Age in years — null if NAS
  whiskeyType: string;   // Type — e.g. "Single Malt", "Bourbon", "Blend"
  averageRating: number; // Denormalized average — 0 if no ratings
  ratingCount: number;   // Denormalized count of ratings
  createdAt: string;     // ISO 8601 datetime
  createdBy: string;     // User ID of the admin who added it
  type: "whiskey";       // Discriminator for queries
}
```

### 1.3 Rating

```typescript
interface Rating {
  id: string;            // Composite: "{eventId}_{whiskeyId}_{userId}"
  eventId: string;       // Foreign key to Event
  whiskeyId: string;     // Foreign key to Whiskey — partition key
  userId: string;        // User ID from SWA auth
  userDisplayName: string; // User display name for reference
  score: number;         // Rating value: 1, 2, 3, 4, or 5
  createdAt: string;     // ISO 8601 datetime
  updatedAt: string;     // ISO 8601 datetime
  type: "rating";        // Discriminator for queries
}
```

### 1.4 User — Derived from SWA Auth

Users are not stored in the database. User identity is derived from the Azure Static Web Apps authentication headers on each request.

```typescript
interface ClientPrincipal {
  identityProvider: string;  // "aad"
  userId: string;            // Unique user ID from provider
  userDetails: string;       // Email address
  userRoles: string[];       // ["anonymous", "authenticated", "admin"]
  claims: Array<{
    typ: string;
    val: string;
  }>;
}
```

### 1.5 API Response Types

```typescript
// List response
interface EventListResponse {
  events: Event[];
}

// Single event with whiskeys
interface EventDetailResponse {
  event: Event;
  whiskeys: WhiskeyWithUserRating[];
}

// Whiskey with user-specific rating
interface WhiskeyWithUserRating {
  id: string;
  eventId: string;
  name: string;
  distillery: string;
  age: number | null;
  whiskeyType: string;
  averageRating: number;
  ratingCount: number;
  userRating: number | null;  // Current user rating or null
}

// Error response
interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
```

---

## 2. Database Schema — Azure Cosmos DB

### 2.1 Database Configuration

| Setting | Value |
|---------|-------|
| **Account Name** | `cosmos-whiskyapp-{env}` |
| **API** | NoSQL — Core SQL |
| **Capacity Mode** | Serverless |
| **Consistency Level** | Session |
| **Database Name** | `whiskyapp` |

### 2.2 Container Definitions

#### Container: `events`

| Setting | Value |
|---------|-------|
| **Partition Key** | `/id` |
| **Unique Keys** | None |
| **TTL** | Off |
| **Indexing Policy** | Default — all properties indexed |

#### Container: `whiskeys`

| Setting | Value |
|---------|-------|
| **Partition Key** | `/eventId` |
| **Unique Keys** | None |
| **TTL** | Off |
| **Indexing Policy** | Default — all properties indexed |

**Rationale**: Partitioning by `eventId` ensures all whiskeys for an event are co-located, enabling efficient single-partition queries when viewing an event.

#### Container: `ratings`

| Setting | Value |
|---------|-------|
| **Partition Key** | `/whiskeyId` |
| **Unique Keys** | None |
| **TTL** | Off |
| **Indexing Policy** | Default — all properties indexed |

**Rationale**: Partitioning by `whiskeyId` ensures all ratings for a whiskey are co-located, enabling efficient average calculation and user-specific rating lookup.

### 2.3 Key Queries

```sql
-- List all events, sorted by date descending
SELECT * FROM events e WHERE e.type = "event" ORDER BY e.date DESC

-- Get whiskeys for an event — single partition query
SELECT * FROM whiskeys w WHERE w.eventId = @eventId AND w.type = "whiskey"

-- Get user rating for a specific whiskey
SELECT * FROM ratings r WHERE r.whiskeyId = @whiskeyId AND r.userId = @userId

-- Get all ratings for a whiskey — for recalculating average
SELECT r.score FROM ratings r WHERE r.whiskeyId = @whiskeyId

-- Get user ratings for all whiskeys in an event — for the whiskey list view
SELECT r.whiskeyId, r.score FROM ratings r
WHERE r.whiskeyId IN (@whiskeyId1, @whiskeyId2, ...)
AND r.userId = @userId
```

---

## 3. API Endpoint Specifications

### 3.1 Events

#### `GET /api/events` — List All Events

- **Auth**: None
- **Request**: No body
- **Response** `200`:
```json
{
  "events": [
    {
      "id": "uuid-1",
      "name": "Spring Tasting 2026",
      "date": "2026-05-20",
      "whiskeyCount": 8,
      "createdAt": "2026-05-01T10:00:00Z",
      "updatedAt": "2026-05-01T10:00:00Z"
    }
  ]
}
```

#### `POST /api/events` — Create Event

- **Auth**: Required — Admin role
- **Request**:
```json
{
  "name": "Spring Tasting 2026",
  "date": "2026-05-20"
}
```
- **Validation**:
  - `name`: Required, string, 1–200 characters
  - `date`: Required, valid ISO 8601 date
- **Response** `201`:
```json
{
  "id": "uuid-1",
  "name": "Spring Tasting 2026",
  "date": "2026-05-20",
  "whiskeyCount": 0,
  "createdAt": "2026-05-01T10:00:00Z",
  "updatedAt": "2026-05-01T10:00:00Z",
  "createdBy": "google-user-id"
}
```
- **Errors**: `400` — validation error, `401` — not authenticated, `403` — not admin

#### `GET /api/events/:eventId` — Get Event Details

- **Auth**: None
- **Request**: No body
- **Response** `200`:
```json
{
  "event": {
    "id": "uuid-1",
    "name": "Spring Tasting 2026",
    "date": "2026-05-20",
    "whiskeyCount": 8,
    "createdAt": "2026-05-01T10:00:00Z",
    "updatedAt": "2026-05-01T10:00:00Z"
  },
  "whiskeys": [
    {
      "id": "uuid-w1",
      "eventId": "uuid-1",
      "name": "Lagavulin 16",
      "distillery": "Lagavulin",
      "age": 16,
      "whiskeyType": "Single Malt",
      "averageRating": 4.2,
      "ratingCount": 5,
      "userRating": 4
    }
  ]
}
```
- **Notes**: `userRating` is `null` if the user is not authenticated or has not rated the whiskey.
- **Errors**: `404` — event not found

#### `PUT /api/events/:eventId` — Update Event

- **Auth**: Required — Admin role
- **Request**:
```json
{
  "name": "Updated Name",
  "date": "2026-06-15"
}
```
- **Validation**: Same as POST
- **Response** `200`: Updated event object
- **Errors**: `400`, `401`, `403`, `404`

#### `DELETE /api/events/:eventId` — Delete Event

- **Auth**: Required — Admin role
- **Request**: No body
- **Response** `204`: No content
- **Side Effects**: Deletes all whiskeys and ratings associated with the event
- **Errors**: `401`, `403`, `404`

### 3.2 Whiskeys

#### `GET /api/events/:eventId/whiskeys` — List Whiskeys in Event

- **Auth**: None
- **Request**: No body
- **Response** `200`:
```json
{
  "whiskeys": [
    {
      "id": "uuid-w1",
      "eventId": "uuid-1",
      "name": "Lagavulin 16",
      "distillery": "Lagavulin",
      "age": 16,
      "whiskeyType": "Single Malt",
      "averageRating": 4.2,
      "ratingCount": 5,
      "userRating": null
    }
  ]
}
```
- **Errors**: `404` — event not found

#### `POST /api/events/:eventId/whiskeys` — Add Whiskey to Event

- **Auth**: Required — Admin role
- **Request**:
```json
{
  "name": "Lagavulin 16",
  "distillery": "Lagavulin",
  "age": 16,
  "whiskeyType": "Single Malt"
}
```
- **Validation**:
  - `name`: Required, string, 1–200 characters
  - `distillery`: Required, string, 1–200 characters
  - `age`: Optional, integer, 0–100
  - `whiskeyType`: Required, string, one of: "Single Malt", "Blended Malt", "Blended", "Bourbon", "Rye", "Irish", "Japanese", "Other"
- **Response** `201`: Created whiskey object
- **Side Effects**: Increments `whiskeyCount` on the parent event
- **Errors**: `400`, `401`, `403`, `404` — event not found

#### `DELETE /api/events/:eventId/whiskeys/:whiskeyId` — Remove Whiskey

- **Auth**: Required — Admin role
- **Request**: No body
- **Response** `204`: No content
- **Side Effects**: Deletes all ratings for this whiskey; decrements `whiskeyCount` on the parent event
- **Errors**: `401`, `403`, `404`

### 3.3 Ratings

#### `PUT /api/events/:eventId/whiskeys/:whiskeyId/rating` — Upsert Rating

- **Auth**: Required — Authenticated role
- **Request**:
```json
{
  "score": 4
}
```
- **Validation**:
  - `score`: Required, integer, 1–5
- **Response** `200`:
```json
{
  "rating": {
    "whiskeyId": "uuid-w1",
    "userId": "google-user-id",
    "score": 4,
    "updatedAt": "2026-05-20T14:30:00Z"
  },
  "whiskey": {
    "averageRating": 4.2,
    "ratingCount": 6
  }
}
```
- **Side Effects**: Recalculates and updates `averageRating` and `ratingCount` on the whiskey document
- **Errors**: `400`, `401`, `404` — whiskey not found

#### `DELETE /api/events/:eventId/whiskeys/:whiskeyId/rating` — Remove Rating

- **Auth**: Required — Authenticated role
- **Request**: No body
- **Response** `204`: No content
- **Side Effects**: Recalculates and updates `averageRating` and `ratingCount` on the whiskey document
- **Errors**: `401`, `404` — rating not found

---

## 4. Authentication Flow

### 4.1 Entra ID via Azure Static Web Apps

Azure Static Web Apps provides built-in authentication endpoints that handle the entire OAuth flow.

#### Sign-In Flow

1. User clicks "Sign In" button in the React app
2. Browser navigates to `/.auth/login/aad`
3. SWA redirects to Microsoft Entra ID consent screen
4. User authenticates with Microsoft and grants consent
5. Microsoft redirects back to SWA callback URL
6. SWA creates a session cookie and redirects to the app — default: `/`
7. App calls `/.auth/me` to get user info and roles

#### Sign-Out Flow

1. User clicks "Sign Out" button
2. Browser navigates to `/.auth/logout`
3. SWA clears the session cookie
4. Browser redirects to the app — default: `/`

### 4.2 Extracting User Identity in API Functions

SWA automatically injects the `x-ms-client-principal` header into requests forwarded to managed functions. This header contains a Base64-encoded JSON payload.

```typescript
// api/src/middleware/auth.ts

interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

function getClientPrincipal(req: HttpRequest): ClientPrincipal | null {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) return null;

  const encoded = Buffer.from(header, "base64");
  const decoded = encoded.toString("utf-8");
  return JSON.parse(decoded) as ClientPrincipal;
}

function isAuthenticated(principal: ClientPrincipal | null): boolean {
  return principal !== null
    && principal.userRoles.includes("authenticated");
}

function isAdmin(principal: ClientPrincipal | null): boolean {
  return principal !== null
    && principal.userRoles.includes("admin");
}
```

### 4.3 Admin Role Assignment

Admin roles are assigned through the Azure Static Web Apps portal:

1. Navigate to Azure Portal → Static Web Apps → Role Management
2. Create an invitation for the admin user email
3. Assign the `admin` role
4. The invited user accepts the invitation link
5. On subsequent sign-ins, the user receives the `admin` role in their `userRoles` array

### 4.4 SWA Configuration for Auth

```json
// staticwebapp.config.json
{
  "routes": [
    {
      "route": "/.auth/login/aad",
      "allowedRoles": ["anonymous"]
    },
    {
      "route": "/.auth/logout",
      "allowedRoles": ["anonymous"]
    },
    {
      "route": "/api/events",
      "methods": ["POST"],
      "allowedRoles": ["admin"]
    },
    {
      "route": "/api/events/*",
      "methods": ["PUT", "DELETE"],
      "allowedRoles": ["admin"]
    },
    {
      "route": "/api/events/*/whiskeys",
      "methods": ["POST"],
      "allowedRoles": ["admin"]
    },
    {
      "route": "/api/events/*/whiskeys/*",
      "methods": ["DELETE"],
      "allowedRoles": ["admin"]
    },
    {
      "route": "/api/events/*/whiskeys/*/rating",
      "methods": ["PUT", "DELETE"],
      "allowedRoles": ["authenticated"]
    },
    {
      "route": "/api/*",
      "methods": ["GET"],
      "allowedRoles": ["anonymous"]
    }
  ],
  "responseOverrides": {
    "401": {
      "redirect": "/.auth/login/aad",
      "statusCode": 302
    }
  },
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/api/*", "/.auth/*"]
  },
  "platform": {
    "apiRuntime": "node:20"
  }
}
```

No `auth.identityProviders` block is needed for the pre-configured Entra ID provider on the Free SKU.

---

## 5. Frontend Component Specification

### 5.1 Component Tree with Props

```
App
│
├── QueryClientProvider [client: QueryClient]
│   └── AuthProvider
│       └── BrowserRouter
│           └── Layout
│               ├── Header
│               │   ├── Logo
│               │   ├── Nav [links: NavLink array]
│               │   └── AuthButton
│               │       Props: none — uses useAuth hook
│               │       State: user from AuthContext
│               │
│               └── Routes
│                   ├── Route path="/" → EventListPage
│                   │   ├── EventCard [event: Event, onDelete: fn]
│                   │   │   Props: event, isAdmin
│                   │   │   Displays: name, date, whiskeyCount
│                   │   │
│                   │   └── CreateEventDialog [onCreated: fn]
│                   │       Props: none — admin-only render
│                   │       State: name, date form fields
│                   │
│                   ├── Route path="/events/:eventId" → EventDetailPage
│                   │   ├── EventHeader [event: Event]
│                   │   │   Props: event, isAdmin, onEdit, onDelete
│                   │   │
│                   │   ├── WhiskeyList [whiskeys: WhiskeyWithUserRating array]
│                   │   │   └── WhiskeyCard [whiskey: WhiskeyWithUserRating]
│                   │   │       ├── WhiskeyInfo
│                   │   │       │   Displays: name, distillery, age, type
│                   │   │       ├── AverageRating
│                   │   │       │   Displays: averageRating, ratingCount
│                   │   │       ├── UserRatingControl
│                   │   │       │   Props: whiskeyId, eventId, currentRating
│                   │   │       │   State: selected score
│                   │   │       │   Actions: upsert rating, delete rating
│                   │   │       └── DeleteWhiskeyButton — admin only
│                   │   │
│                   │   └── AddWhiskeyDialog [eventId: string, onAdded: fn]
│                   │       Props: eventId
│                   │       State: name, distillery, age, whiskeyType
│                   │
│                   └── Route path="*" → NotFoundPage
```

### 5.2 Custom Hooks

```typescript
// useAuth — access current user and auth state
function useAuth(): {
  user: ClientPrincipal | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: () => void;   // navigates to /.auth/login/aad
  logout: () => void;  // navigates to /.auth/logout
}

// useEvents — fetch and manage events
function useEvents(): {
  events: Event[];
  isLoading: boolean;
  error: Error | null;
  createEvent: UseMutationResult;
  deleteEvent: UseMutationResult;
  updateEvent: UseMutationResult;
}

// useEventDetail — fetch single event with whiskeys
function useEventDetail(eventId: string): {
  event: Event | null;
  whiskeys: WhiskeyWithUserRating[];
  isLoading: boolean;
  error: Error | null;
}

// useWhiskeys — manage whiskeys in an event
function useWhiskeys(eventId: string): {
  addWhiskey: UseMutationResult;
  deleteWhiskey: UseMutationResult;
}

// useRating — manage user rating for a whiskey
function useRating(eventId: string, whiskeyId: string): {
  upsertRating: UseMutationResult;
  deleteRating: UseMutationResult;
}
```

### 5.3 State Management

| State Type | Solution | Scope |
|------------|----------|-------|
| **Server State** | TanStack Query | Events, whiskeys, ratings — cached and auto-refreshed |
| **Auth State** | React Context | User identity, roles — fetched from `/.auth/me` on mount |
| **UI State** | React useState | Form inputs, dialog open/close, loading indicators |
| **URL State** | React Router | Current page, event ID parameter |

### 5.4 API Client

```typescript
// src/services/api.ts

const API_BASE = "/api";

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(response.status, error.error.code, error.error.message);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// Event API
const eventsApi = {
  list: () => fetchJson<EventListResponse>("/events"),
  get: (id: string) => fetchJson<EventDetailResponse>(`/events/${id}`),
  create: (data: CreateEventRequest) =>
    fetchJson<Event>("/events", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: UpdateEventRequest) =>
    fetchJson<Event>(`/events/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    fetchJson<void>(`/events/${id}`, { method: "DELETE" }),
};

// Whiskey API
const whiskeysApi = {
  add: (eventId: string, data: CreateWhiskeyRequest) =>
    fetchJson<Whiskey>(`/events/${eventId}/whiskeys`, {
      method: "POST", body: JSON.stringify(data),
    }),
  delete: (eventId: string, whiskeyId: string) =>
    fetchJson<void>(`/events/${eventId}/whiskeys/${whiskeyId}`, {
      method: "DELETE",
    }),
};

// Rating API
const ratingsApi = {
  upsert: (eventId: string, whiskeyId: string, data: UpsertRatingRequest) =>
    fetchJson<RatingResponse>(
      `/events/${eventId}/whiskeys/${whiskeyId}/rating`,
      { method: "PUT", body: JSON.stringify(data) },
    ),
  delete: (eventId: string, whiskeyId: string) =>
    fetchJson<void>(
      `/events/${eventId}/whiskeys/${whiskeyId}/rating`,
      { method: "DELETE" },
    ),
};
```

---

## 6. Environment Variables

### 6.1 Azure Function App Settings

| Variable | Description | Example |
|----------|-------------|---------|
| `COSMOS_ENDPOINT` | Cosmos DB account endpoint | `https://cosmos-whiskyapp-prod.documents.azure.com:443/` |
| `COSMOS_KEY` | Cosmos DB account key | `your-cosmos-key` |
| `COSMOS_DATABASE` | Database name | `whiskyapp` |
| `USE_COSMOS_MOCK` | Use in-memory mock instead of real Cosmos DB | `true` or `false` |

### 6.2 Local Development

#### Option A — In-Memory CosmosDB Mock (Recommended)

The project includes a built-in in-memory CosmosDB mock that eliminates the need for any external database during local development. This is the default configuration.

**Activation**: Set `USE_COSMOS_MOCK` to `"true"` in `api/local.settings.json`. This is already enabled in the example settings file.

```json
// api/local.settings.json — NOT committed to git
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "COSMOS_ENDPOINT": "",
    "COSMOS_KEY": "",
    "COSMOS_DATABASE": "whiskyapp",
    "USE_COSMOS_MOCK": "true"
  }
}
```

When the mock is active, `getContainer()` in `api/src/lib/cosmos.ts` returns a `MockContainer` from `api/src/lib/cosmos.mock.ts` instead of connecting to a real Cosmos DB instance. The `COSMOS_ENDPOINT` and `COSMOS_KEY` values are ignored.

**Seed data** — The mock pre-loads the following data on every function host startup:

| Container | Count | Examples |
|-----------|-------|----------|
| `events` | 2 | "Islay Whisky Festival 2026", "Highland Whisky Tasting" |
| `whiskeys` | 7 | Lagavulin 16, Ardbeg Uigeadail, Talisker 10, Dalmore King Alexander III, Glenmorangie Original, Oban 14, Balblair 2009 |
| `ratings` | 5 | Ratings from two mock users — "Alice" and "Bob" |

**Supported operations**:

- `items.query()` — `WHERE`, `AND`, `ORDER BY`, `SELECT` projections
- `items.create()` — insert new documents
- `item().read()` — read by ID
- `item().replace()` — full document replacement
- `item().delete()` — delete by ID
- `item().patch()` — partial updates with `incr` and `set` operations

**Limitations**:

- Data is stored in-memory only — all changes are lost when the function host restarts
- Query parsing supports common patterns but not the full Cosmos DB SQL grammar
- No cross-partition query cost simulation or RU tracking
- IDs are regenerated on each restart, so hardcoded references will not persist

**File structure**:

```
api/src/lib/
├── cosmos.ts        # getContainer() — routes to mock or real Cosmos DB
└── cosmos.mock.ts   # MockContainer + seed data — pure TypeScript, no dependencies
```

#### Option B — Real Cosmos DB

To use a real Cosmos DB instance instead of the mock, set `USE_COSMOS_MOCK` to `"false"` and provide valid credentials:

```json
{
  "Values": {
    "USE_COSMOS_MOCK": "false",
    "COSMOS_ENDPOINT": "https://cosmos-whiskyapp-dev.documents.azure.com:443/",
    "COSMOS_KEY": "your-cosmos-key",
    "COSMOS_DATABASE": "whiskyapp"
  }
}
```

You can use either a cloud Cosmos DB account or the **Azure Cosmos DB Emulator** for a local database instance.

#### SWA CLI — Full Local Dev Experience

Use the **Azure Static Web Apps CLI** for the full local development experience with auth emulation:

```bash
# Install SWA CLI
npm install -g @azure/static-web-apps-cli

# Start local development
swa start http://localhost:5173 --api-location ./api
```

---

## 7. Azure Services Configuration

### 7.1 Azure Static Web Apps

```
Resource Name: swa-whiskyapp-{env}
Plan: Free
Region: West Europe — or nearest to users
Source: GitHub repository
Build Configuration:
  app_location: "/"
  api_location: "api"
  output_location: "dist"
```

### 7.2 Azure Cosmos DB

```
Resource Name: cosmos-whiskyapp-{env}
API: NoSQL — Core SQL
Capacity Mode: Serverless
Region: West Europe — same as SWA
Backup Policy: Periodic — default for serverless
Network: Public access — restrict via connection string
```

### 7.3 Entra ID — Provider Configuration

Entra ID is a pre-configured identity provider on Azure Static Web Apps Free SKU. No separate app registration or client credentials are required for the default multitenant setup.

- **Login URL**: `/.auth/login/aad`
- **Supported accounts**: Any Microsoft account (personal or work/school)
- **No client ID/secret required** for the pre-configured provider

To restrict authentication to a single Azure AD tenant, an Azure App Registration would be required — this is a Standard SKU feature. For the MVP on Free SKU, the pre-configured multitenant provider is used as-is.

---

## 8. Error Handling Strategy

### 8.1 API Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `UNAUTHORIZED` | 401 | Authentication required but not provided |
| `FORBIDDEN` | 403 | User lacks required role |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Resource already exists — if applicable |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### 8.2 Frontend Error Handling

- **Network errors**: Show toast notification with retry option
- **401 errors**: Redirect to sign-in
- **403 errors**: Show "access denied" message
- **404 errors**: Show "not found" page
- **Validation errors**: Show inline field-level error messages
- **500 errors**: Show generic error message with retry option

---

## 9. Testing Strategy

### 9.1 Frontend Testing

| Layer | Tool | Scope |
|-------|------|-------|
| Unit Tests | Vitest | Utility functions, hooks |
| Component Tests | Vitest + React Testing Library | Individual components |
| Integration Tests | Vitest + MSW — Mock Service Worker | Page-level flows with mocked API |

### 9.2 Backend Testing

| Layer | Tool | Scope |
|-------|------|-------|
| Unit Tests | Vitest | Service functions, validation, auth helpers |
| Integration Tests | Vitest | API functions with mocked Cosmos DB |

### 9.3 End-to-End Testing

| Layer | Tool | Scope |
|-------|------|-------|
| E2E Tests | Playwright | Critical user flows — browse, rate, admin CRUD |

---

## 10. Performance Considerations

### 10.1 Denormalization Strategy

To avoid expensive cross-container queries, the following values are denormalized:

- `Event.whiskeyCount` — updated when whiskeys are added/removed
- `Whiskey.averageRating` — recalculated when ratings change
- `Whiskey.ratingCount` — updated when ratings are added/removed

This means the whiskey list view requires only a single query to the `whiskeys` container — plus one query to `ratings` for the current user ratings — rather than aggregating ratings on every read.

### 10.2 Query Optimization

- All list queries use partition-key-aligned access patterns
- Whiskey list for an event: single partition query on `whiskeys` container
- User ratings for an event: cross-partition query on `ratings` — acceptable for small datasets
- Consider adding a composite index on `ratings` for `[whiskeyId, userId]` if performance degrades

### 10.3 Frontend Optimization

- TanStack Query provides automatic caching and background refetching
- Stale time: 30 seconds for event lists, 10 seconds for event details — ratings may change during events
- React.lazy for route-level code splitting
- Vite tree-shaking eliminates unused code
