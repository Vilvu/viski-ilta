# WhiskyApp — Technical Specification

## 1. Data Models

### 1.1 Event

```typescript
interface Event {
  id: string;            // UUID — partition key
  name: string;          // Event name — e.g. "Spring Tasting 2026"
  date: string;          // ISO 8601 date — e.g. "2026-05-20"
  location: string;      // Venue
  description: string;
  createdAt: string;     // ISO 8601 datetime
  updatedAt: string;     // ISO 8601 datetime
  createdBy: string;     // Display name of the admin who created it
  whiskeyCount: number;  // Denormalized count of eventWhiskeys links for this event
}
```

### 1.2 Whiskey (catalog)

Whiskeys are **global catalog items** — they exist independently of any event and may appear in multiple events.

```typescript
interface WhiskeyDocument {
  id: string;                  // UUID — partition key (/id)
  name: string;                // e.g. "Lagavulin 16"
  distillery: string;          // e.g. "Lagavulin"
  region: string;              // e.g. "Islay"
  age?: number;                // Age in years — omitted if NAS
  abv?: number;                // ABV percentage
  description?: string;
  createdBy: string;           // Display name
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  globalAverageRating: number; // Average across all events — 0 if no ratings
  globalRatingCount: number;   // Total ratings across all events
}
```

### 1.3 EventWhiskey (link)

The `eventWhiskeys` container records that a catalog whiskey is poured at a specific event and carries **event-scoped aggregates**.

```typescript
interface EventWhiskeyDocument {
  id: string;           // UUID — document id
  eventId: string;      // Partition key (/eventId)
  whiskeyId: string;    // Reference to WhiskeyDocument.id
  addedBy: string;      // Display name of user who linked the whiskey
  addedByUserId: string;
  createdAt: string;
  averageRating: number; // Average rating within this event only — 0 if none
  ratingCount: number;   // Rating count within this event only
}
```

Uniqueness: at most one link per `(eventId, whiskeyId)`.

### 1.4 Rating

Ratings are **event-scoped** — a user may rate the same whiskey differently across different events.

```typescript
interface RatingDocument {
  id: string;       // UUID
  eventId: string;  // Partition key (/eventId)
  whiskeyId: string;
  userId: string;   // User ID from SWA auth
  userName: string; // Display name at time of rating
  score: number;    // 1–10
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

Uniqueness: one rating per `(eventId, whiskeyId, userId)`.

### 1.5 Aggregate Recomputation Rules

On every rating create, update, or delete for `(eventId, whiskeyId)`:

1. **Event-scoped aggregate**: Query `ratings WHERE eventId = X AND whiskeyId = Y`; compute mean (rounded to 1 decimal); patch the `eventWhiskeys` link document (`averageRating`, `ratingCount`).
2. **Global aggregate**: Query `ratings WHERE whiskeyId = Y` (across all events); compute mean; patch the `whiskeys` document (`globalAverageRating`, `globalRatingCount`).

Implemented in `api/src/lib/aggregates.ts` — `recomputeEventAggregate(eventId, whiskeyId)` and `recomputeGlobalAggregate(whiskeyId)`.

### 1.6 User — Derived from SWA Auth

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
| **Partition Key** | `/id` |
| **Unique Keys** | None |
| **TTL** | Off |
| **Indexing Policy** | Default — all properties indexed |

**Rationale**: Whiskeys are global catalog items. Partitioning by `/id` allows efficient point reads by whiskey ID from any event context.

#### Container: `eventWhiskeys`

| Setting | Value |
|---------|-------|
| **Partition Key** | `/eventId` |
| **Unique Keys** | None |
| **TTL** | Off |
| **Indexing Policy** | Default — all properties indexed |

**Rationale**: Partitioning by `eventId` keeps all whiskey links for an event in a single partition, enabling efficient list queries per event. Each document stores event-scoped aggregates (`averageRating`, `ratingCount`) so the whiskey list view requires no additional joins.

#### Container: `ratings`

| Setting | Value |
|---------|-------|
| **Partition Key** | `/eventId` |
| **Unique Keys** | None |
| **TTL** | Off |
| **Indexing Policy** | Default — all properties indexed |

**Rationale**: Partitioning by `eventId` keeps all ratings for an event in a single partition. The dominant read pattern is "all ratings for a whiskey at a specific event", which is a single-partition query. The global aggregate query (`WHERE whiskeyId = @w`) is cross-partition but acceptable at low write frequency.

### 2.3 Key Queries

```sql
-- List all events, sorted by date descending
SELECT * FROM c ORDER BY c.date DESC

-- Catalog whiskeys ordered by global average rating (ranking)
SELECT c.id, c.name, c.distillery, c.region, c.age, c.abv,
       c.globalAverageRating, c.globalRatingCount
FROM c ORDER BY c.globalAverageRating DESC OFFSET @skip LIMIT @top

-- Get event whiskey links — single partition query
SELECT * FROM c WHERE c.eventId = @eventId ORDER BY c.whiskeyId

-- Find a specific event-whiskey link
SELECT * FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId

-- Get ratings for a whiskey within an event — event-scoped (single partition)
SELECT * FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId
ORDER BY c.createdAt DESC

-- Find a user's rating in an event for a whiskey (upsert check)
SELECT * FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId
AND c.userId = @userId

-- Recompute event-scoped aggregate (single partition)
SELECT c.score FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId

-- Recompute global aggregate (cross-partition; acceptable for low-frequency writes)
SELECT c.score FROM c WHERE c.whiskeyId = @whiskeyId

-- Get user's ratings for all whiskeys in an event (for userRating on whiskey list)
SELECT c.whiskeyId, c.score FROM c WHERE c.eventId = @eventId AND c.userId = @userId
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
- **Errors**: `401`, `403`, `404`

### 3.2 Catalog Whiskeys

#### `GET /api/whiskeys` — List Catalog Whiskeys (Ranking)

- **Auth**: None
- **Query Params**: `top` (default 100, max 1000), `skip` (default 0)
- **Response** `200`: Array of catalog whiskeys ordered by `globalAverageRating` DESC.
```json
[
  {
    "id": "uuid-w1",
    "name": "Lagavulin 16",
    "distillery": "Lagavulin",
    "region": "Islay",
    "age": 16,
    "abv": 43,
    "globalAverageRating": 8.3,
    "globalRatingCount": 5
  }
]
```

#### `POST /api/whiskeys` — Create Catalog Whiskey

- **Auth**: Required — Taster role
- **Request**:
```json
{
  "name": "Lagavulin 16",
  "distillery": "Lagavulin",
  "region": "Islay",
  "age": 16,
  "abv": 43,
  "description": "Rich and smoky"
}
```
- **Validation**: `name`, `distillery`, `region` required.
- **Response** `201`: Created whiskey with `globalAverageRating: 0`, `globalRatingCount: 0`.
- **Errors**: `400`, `401`

#### `GET /api/whiskeys/:whiskeyId` — Get Catalog Whiskey

- **Auth**: None
- **Response** `200`: Full catalog whiskey document.
- **Errors**: `404`

#### `PATCH /api/whiskeys/:whiskeyId` — Update Catalog Whiskey

- **Auth**: Required — Taster; creator or admin.
- **Request**: Any subset of `name, distillery, region, age, abv, description`.
- **Response** `200`: Updated whiskey. Aggregate fields are not overwritable by the client.
- **Errors**: `400`, `401`, `403`, `404`

#### `DELETE /api/whiskeys/:whiskeyId` — Delete Catalog Whiskey

- **Auth**: Required — Taster; creator or admin.
- **Response** `204`: No content.
- **Policy**: Returns `409` if the whiskey is linked to one or more events. Remove all event links first.
- **Errors**: `401`, `403`, `404`, `409`

### 3.3 Event ↔ Whiskey Links

#### `GET /api/events/:eventId/whiskeys` — List Whiskeys at Event

- **Auth**: None (authenticated users receive `userRating` in each item)
- **Response** `200`: Array of joined whiskeys — catalog fields + event-scoped aggregates.
```json
[
  {
    "id": "uuid-w1",
    "eventId": "uuid-e1",
    "name": "Lagavulin 16",
    "distillery": "Lagavulin",
    "region": "Islay",
    "age": 16,
    "abv": 43,
    "averageRating": 8.5,
    "ratingCount": 2,
    "userRating": 9
  }
]
```
- **Notes**: `averageRating`/`ratingCount` are **event-scoped** (from the `eventWhiskeys` link). `userRating` is present only when authenticated.

#### `POST /api/events/:eventId/whiskeys` — Add Whiskey to Event

- **Auth**: Required — Taster role
- **Request (link existing)**:
```json
{ "whiskeyId": "uuid-w1" }
```
- **Request (create + link)**:
```json
{
  "name": "Lagavulin 16",
  "distillery": "Lagavulin",
  "region": "Islay",
  "age": 16,
  "abv": 43
}
```
- **Response** `201`: Joined whiskey shape (same as GET item).
- **Side Effects**: Creates `eventWhiskeys` link with `averageRating: 0, ratingCount: 0`; increments `event.whiskeyCount`.
- **Errors**: `400` — missing fields, `404` — whiskey not found (link mode), `409` — already linked

#### `GET /api/events/:eventId/whiskeys/:whiskeyId` — Get Event Whiskey

- **Auth**: Required — Taster
- **Response** `200`: Joined whiskey with event-scoped aggregates and `userRating` if rated.
- **Errors**: `404` — not found in this event

#### `DELETE /api/events/:eventId/whiskeys/:whiskeyId` — Remove Whiskey from Event

- **Auth**: Required — Taster; link creator or admin.
- **Response** `204`: No content.
- **Side Effects**: Deletes the `eventWhiskeys` link; deletes all ratings for `(eventId, whiskeyId)` in this event; recomputes the whiskey's global aggregate; decrements `event.whiskeyCount`.
- **Note**: The catalog whiskey is **not** deleted.
- **Errors**: `401`, `403`, `404`

### 3.4 Ratings

#### `GET /api/events/:eventId/whiskeys/:whiskeyId/ratings` — List Ratings

- **Auth**: Required — Taster
- **Response** `200`: Array of ratings for this `(eventId, whiskeyId)`, ordered by `createdAt` DESC.

#### `PUT /api/events/:eventId/whiskeys/:whiskeyId/ratings/me` — Upsert Own Rating

- **Auth**: Required — Taster
- **Request**:
```json
{
  "score": 8,
  "notes": "Excellent"
}
```
- **Validation**: `score` 1–10 (inclusive).
- **Response** `200`: Upserted rating document.
- **Side Effects**: Creates or replaces rating for `(eventId, whiskeyId, userId)`; recomputes event-scoped aggregate (`eventWhiskeys` link) and global aggregate (`whiskeys` document).
- **Errors**: `400`, `401`

#### `DELETE /api/events/:eventId/whiskeys/:whiskeyId/ratings/me` — Delete Own Rating

- **Auth**: Required — Taster
- **Response** `204`: No content.
- **Side Effects**: Deletes rating; recomputes event-scoped and global aggregates (sets to 0 when last rating removed).
- **Errors**: `401`, `404`

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

| Container | Count | Notes |
|-----------|-------|-------|
| `events` | 2 | "Islay Whisky Festival 2026" (3 whiskeys), "Highland Whisky Tasting" (5 whiskeys) |
| `whiskeys` | 7 | Catalog items: Lagavulin 16, Ardbeg Uigeadail, Talisker 10, Dalmore, Glenmorangie Original, Oban 14, Balblair 2009 — no `eventId` field |
| `eventWhiskeys` | 8 | Event1↔{lagavulin, ardbeg, talisker}; Event2↔{dalmore, glenmorangie, oban, balblair, lagavulin}. Lagavulin is linked to both events with different per-event averages. |
| `ratings` | 11 | Ratings from two mock users — "Alice" (user1) and "Bob" (user2). Alice rates Lagavulin 9 in Event1 and 7 in Event2, demonstrating cross-event independence. |

Aggregates are hand-computed in the seed so reads are self-consistent without running any recompute. See `cosmos.mock.ts` code comments for the arithmetic.

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
