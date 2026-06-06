# WhiskyApp — Architecture Document

## 1. System Architecture Overview

### 1.1 High-Level Architecture

WhiskyApp follows a **serverless, JAMstack-inspired architecture** on Azure, optimizing for cost, simplicity, and scalability.

```
┌─────────────────────────────────────────────────────────────────┐
│                        AZURE CLOUD                              │
│                                                                 │
│  ┌──────────────────────────────────┐                           │
│  │   Azure Static Web Apps          │                           │
│  │  ┌────────────────────────────┐  │                           │
│  │  │  React SPA - Frontend     │  │                           │
│  │  │  - TypeScript + Vite      │  │                           │
│  │  │  - Built-in Auth          │  │                           │
│  │  └────────────┬───────────────┘  │                           │
│  │               │                  │                           │
│  │  ┌────────────▼───────────────┐  │                           │
│  │  │  Managed Azure Functions   │  │                           │
│  │  │  - API Routes /api/*      │  │                           │
│  │  │  - Node.js + TypeScript   │  │                           │
│  │  └────────────┬───────────────┘  │                           │
│  └───────────────│──────────────────┘                           │
│                  │                                               │
│  ┌───────────────▼──────────────────┐                           │
│  │   Azure Cosmos DB                │                           │
│  │   - NoSQL Document Store         │                           │
│  │   - Serverless Capacity Mode     │                           │
│  │   - whiskyapp database           │                           │
│  │     ├── events container         │                           │
│  │     ├── whiskeys container       │                           │
│  │     └── ratings container        │                           │
│  └──────────────────────────────────┘                           │
│                                                                 │
│  ┌──────────────────────────────────┐                           │
│  │   Google OAuth Provider          │                           │
│  │   - Configured via SWA Auth      │                           │
│  └──────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Request Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant SWA as Azure Static Web Apps
    participant AF as Azure Functions API
    participant DB as Cosmos DB
    participant G as Google OAuth

    U->>SWA: GET / - Load React SPA
    SWA-->>U: HTML/JS/CSS bundle

    Note over U: User clicks Sign In
    U->>SWA: GET /.auth/login/google
    SWA->>G: OAuth redirect
    G-->>SWA: Auth callback with token
    SWA-->>U: Set auth cookie + redirect

    Note over U: User browses events
    U->>SWA: GET /api/events
    SWA->>AF: Proxy to Function
    AF->>DB: Query events container
    DB-->>AF: Event documents
    AF-->>SWA: JSON response
    SWA-->>U: Event list data

    Note over U: User rates a whiskey
    U->>SWA: PUT /api/events/e1/whiskeys/w1/ratings
    SWA->>AF: Proxy with auth context
    AF->>DB: Upsert rating document
    DB-->>AF: Confirmation
    AF-->>SWA: Updated rating
    SWA-->>U: Rating confirmed
```

---

## 2. Technology Stack Decisions

### 2.1 Frontend — React + TypeScript + Vite

| Aspect | Decision |
|--------|----------|
| **Framework** | React 18+ |
| **Language** | TypeScript — strict mode |
| **Build Tool** | Vite — fast dev server and optimized builds |
| **Styling** | CSS Modules or Tailwind CSS — decision deferred to implementation |
| **State Management** | React Query / TanStack Query for server state; React Context for auth state |
| **Routing** | React Router v6 |

**Rationale**: React is the most widely adopted frontend framework with excellent TypeScript support. Vite provides significantly faster development experience compared to Create React App. Azure Static Web Apps has first-class support for React SPAs.

### 2.2 Backend — Azure Functions via Static Web Apps Managed Functions

| Aspect | Decision |
|--------|----------|
| **Runtime** | Node.js 20 LTS |
| **Language** | TypeScript |
| **Framework** | Azure Functions v4 programming model |
| **Hosting** | Managed Functions within Azure Static Web Apps |

**Rationale**: Azure Static Web Apps includes managed Azure Functions at no additional cost on the Free tier. This eliminates the need for a separate Azure Functions resource or App Service, reducing both cost and operational complexity. The `/api/*` route is automatically proxied to the functions, handling CORS and authentication seamlessly.

**Why not standalone Azure Functions or App Service?**
- Standalone Azure Functions would require a separate resource and configuration for CORS and auth
- App Service has a minimum cost even when idle — not cost-effective for MVP
- SWA managed functions provide the simplest deployment model — single `swa deploy` command

### 2.3 Database — Azure Cosmos DB with NoSQL API

| Aspect | Decision |
|--------|----------|
| **Service** | Azure Cosmos DB |
| **API** | NoSQL — Core SQL API |
| **Capacity Mode** | Serverless — pay per request |
| **Consistency** | Session consistency — default |

**Rationale**: Cosmos DB serverless mode charges only for consumed RUs — request units — making it extremely cost-effective for low-traffic MVP scenarios. The flexible schema accommodates evolving data models without migrations. The NoSQL API provides familiar SQL-like query syntax.

**Why not Azure SQL Database?**
- Azure SQL has a minimum monthly cost of ~$5/month even on the Basic tier
- Requires schema migrations for model changes
- Relational model is overkill for this simple domain
- Cosmos DB serverless can cost under $1/month for MVP traffic levels

### 2.4 Authentication — Azure Static Web Apps Built-in Auth

| Aspect | Decision |
|--------|----------|
| **Provider** | Azure Static Web Apps built-in authentication |
| **OAuth Provider** | Google |
| **Session Management** | SWA-managed cookies |
| **Role Management** | SWA role assignments via `staticwebapp.config.json` |

**Rationale**: Azure Static Web Apps provides built-in authentication with zero additional configuration cost. It handles the OAuth flow, session management, and provides user identity to the API functions via request headers. This eliminates the need for Azure AD B2C — which has its own complexity and cost — while providing everything the MVP needs.

**Why not Azure AD B2C?**
- AD B2C requires a separate tenant, custom policies, and user flows — significant setup complexity
- AD B2C has a cost per authentication — first 50K/month free, but adds operational overhead
- SWA built-in auth is simpler, free, and sufficient for Google OAuth
- Can migrate to AD B2C later if more providers or advanced flows are needed

**Admin Role Assignment**: Admin users are configured in the Azure Static Web Apps portal by assigning the `admin` role to specific Google-authenticated user identities. This is managed through the SWA invitation system or via the Azure portal.

### 2.5 Hosting — Azure Static Web Apps

| Aspect | Decision |
|--------|----------|
| **Plan** | Free tier — sufficient for MVP |
| **Custom Domain** | Optional — Azure-provided domain for MVP |
| **SSL** | Automatic — included with SWA |
| **CI/CD** | GitHub Actions — auto-configured by SWA |

**Rationale**: Azure Static Web Apps Free tier includes hosting, managed functions, built-in auth, custom domains, and SSL — all at zero cost. This is the most cost-effective option for an MVP.

### 2.6 Technology Stack Summary

```
┌─────────────────────────────────────────────┐
│              Technology Stack                │
├─────────────────────────────────────────────┤
│  Frontend                                    │
│  ├── React 18+                               │
│  ├── TypeScript - strict                     │
│  ├── Vite                                    │
│  ├── React Router v6                         │
│  ├── TanStack Query                          │
│  └── CSS Modules or Tailwind CSS             │
├─────────────────────────────────────────────┤
│  Backend                                     │
│  ├── Azure Functions v4                      │
│  ├── Node.js 20 LTS                          │
│  ├── TypeScript                              │
│  └── @azure/cosmos SDK                       │
├─────────────────────────────────────────────┤
│  Data                                        │
│  ├── Azure Cosmos DB - NoSQL API             │
│  └── Serverless capacity mode                │
├─────────────────────────────────────────────┤
│  Auth                                        │
│  ├── Azure SWA built-in auth                 │
│  └── Google OAuth provider                   │
├─────────────────────────────────────────────┤
│  Infrastructure                              │
│  ├── Azure Static Web Apps - Free tier       │
│  ├── GitHub Actions - CI/CD                  │
│  └── Azure Cosmos DB - Serverless            │
└─────────────────────────────────────────────┘
```

---

## 3. Component Architecture

### 3.1 Frontend Component Tree

```
App
├── Layout
│   ├── Header
│   │   ├── Logo
│   │   ├── Navigation
│   │   └── AuthButton - sign in/out + user info
│   └── Main - route outlet
├── Pages
│   ├── EventListPage
│   │   ├── EventCard - repeated for each event
│   │   └── CreateEventForm - admin only
│   ├── EventDetailPage
│   │   ├── EventHeader - name, date, edit/delete for admin
│   │   ├── WhiskeyList
│   │   │   └── WhiskeyCard - repeated for each whiskey
│   │   │       ├── WhiskeyInfo - name, distillery, age, type
│   │   │       ├── AverageRating - overall rating display
│   │   │       ├── UserRating - current user rating with controls
│   │   │       └── RatingCount - total number of ratings
│   │   └── AddWhiskeyForm - admin only
│   └── NotFoundPage
└── Providers
    ├── AuthProvider - user context from SWA auth
    └── QueryClientProvider - TanStack Query
```

### 3.2 Backend Function Structure

```
api/
├── src/
│   ├── functions/
│   │   ├── events.ts          — GET /api/events, POST /api/events
│   │   ├── event.ts           — GET/PUT/DELETE /api/events/:eventId
│   │   ├── whiskeys.ts        — GET /api/events/:eventId/whiskeys
│   │   │                        POST /api/events/:eventId/whiskeys
│   │   ├── whiskey.ts         — DELETE /api/events/:eventId/whiskeys/:whiskeyId
│   │   └── rating.ts         — PUT/DELETE /api/events/:eventId/whiskeys/:whiskeyId/rating
│   ├── services/
│   │   ├── cosmosClient.ts    — Cosmos DB connection singleton
│   │   ├── eventService.ts    — Event CRUD operations
│   │   ├── whiskeyService.ts  — Whiskey CRUD operations
│   │   └── ratingService.ts   — Rating operations
│   ├── middleware/
│   │   └── auth.ts            — Auth helper to extract user from SWA headers
│   ├── models/
│   │   ├── event.ts           — Event type definitions
│   │   ├── whiskey.ts         — Whiskey type definitions
│   │   ├── rating.ts          — Rating type definitions
│   │   └── user.ts            — User type definitions
│   └── utils/
│       ├── validation.ts      — Input validation helpers
│       └── errors.ts          — Error response helpers
├── host.json
├── local.settings.json
├── package.json
└── tsconfig.json
```

---

## 4. Data Flow

### 4.1 Read Flow — Browse Events and Whiskeys

```mermaid
flowchart LR
    A[Browser] -->|GET /api/events| B[SWA Proxy]
    B -->|Forward| C[Azure Function]
    C -->|Query| D[Cosmos DB]
    D -->|Documents| C
    C -->|JSON Array| B
    B -->|Response| A
```

### 4.2 Write Flow — Rate a Whiskey

```mermaid
flowchart LR
    A[Browser] -->|PUT /api/events/e1/whiskeys/w1/rating| B[SWA Proxy]
    B -->|Forward + x-ms-client-principal| C[Azure Function]
    C -->|Validate auth| C
    C -->|Upsert rating| D[Cosmos DB]
    D -->|Confirmation| C
    C -->|Updated rating + new average| B
    B -->|Response| A
```

### 4.3 Auth Flow — Google Sign-In

```mermaid
flowchart LR
    A[Browser] -->|Click Sign In| B[/.auth/login/google]
    B -->|302 Redirect| C[Google OAuth]
    C -->|User consents| D[Google callback]
    D -->|Auth code| E[SWA Auth endpoint]
    E -->|Set cookie| F[Browser - authenticated]
    F -->|Subsequent requests include cookie| G[SWA adds x-ms-client-principal header]
```

---

## 5. API Design Overview

### 5.1 RESTful Endpoints

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `GET` | `/api/events` | None | All | List all events |
| `POST` | `/api/events` | Required | Admin | Create a new event |
| `GET` | `/api/events/:eventId` | None | All | Get event details |
| `PUT` | `/api/events/:eventId` | Required | Admin | Update event |
| `DELETE` | `/api/events/:eventId` | Required | Admin | Delete event and cascade |
| `GET` | `/api/events/:eventId/whiskeys` | None | All | List whiskeys in event |
| `POST` | `/api/events/:eventId/whiskeys` | Required | Admin | Add whiskey to event |
| `DELETE` | `/api/events/:eventId/whiskeys/:whiskeyId` | Required | Admin | Remove whiskey |
| `PUT` | `/api/events/:eventId/whiskeys/:whiskeyId/rating` | Required | User | Upsert user rating |
| `DELETE` | `/api/events/:eventId/whiskeys/:whiskeyId/rating` | Required | User | Remove user rating |

### 5.2 API Conventions

- **Content-Type**: `application/json` for all requests and responses
- **Error Format**: `{ "error": { "code": "NOT_FOUND", "message": "Event not found" } }`
- **Status Codes**: 200 — success, 201 — created, 204 — no content, 400 — bad request, 401 — unauthorized, 403 — forbidden, 404 — not found, 500 — server error
- **Pagination**: Not needed for MVP — event and whiskey counts are small

---

## 6. Security Architecture

### 6.1 Authentication Layer

```
┌─────────────────────────────────────────────┐
│  Azure Static Web Apps Authentication       │
│                                              │
│  /.auth/login/google  → Initiate OAuth      │
│  /.auth/logout        → Clear session       │
│  /.auth/me            → Get current user    │
│                                              │
│  Cookie-based session management             │
│  x-ms-client-principal header to API         │
└─────────────────────────────────────────────┘
```

### 6.2 Authorization Model

```
staticwebapp.config.json:
  /api/events          GET    → anonymous
  /api/events          POST   → admin
  /api/events/*        GET    → anonymous
  /api/events/*        PUT    → admin
  /api/events/*        DELETE → admin, authenticated
  /api/events/*/rating PUT    → authenticated
  /api/events/*/rating DELETE → authenticated
```

Authorization is enforced at two levels:
1. **Route-level**: `staticwebapp.config.json` restricts routes by role
2. **Function-level**: API functions validate the `x-ms-client-principal` header and check roles programmatically

### 6.3 Security Principles

- **Defense in depth**: Auth checked at both SWA route config and function code
- **Least privilege**: Anonymous users get read-only; authenticated users can only manage their own ratings
- **No secrets in client**: All sensitive configuration in Azure Function app settings
- **Input validation**: All API inputs validated before processing
- **HTTPS only**: Enforced by Azure Static Web Apps

---

## 7. Azure Resource Architecture

### 7.1 Resource Group Layout

```
rg-whiskyapp-dev
├── Azure Static Web Apps    — swa-whiskyapp-dev
│   ├── Frontend hosting     — React SPA
│   ├── Managed Functions    — API endpoints
│   └── Built-in Auth        — Google OAuth
└── Azure Cosmos DB Account  — cosmos-whiskyapp-dev
    └── Database: whiskyapp
        ├── Container: events
        ├── Container: whiskeys
        └── Container: ratings
```

### 7.2 Estimated Monthly Cost — MVP

| Resource | Tier | Estimated Cost |
|----------|------|----------------|
| Azure Static Web Apps | Free | $0 |
| Azure Cosmos DB | Serverless | $0–2/month at MVP traffic |
| **Total** | | **$0–2/month** |

### 7.3 Environment Strategy

| Environment | Purpose | Resources |
|-------------|---------|-----------|
| `dev` | Development and testing | Separate resource group |
| `prod` | Production | Separate resource group |

For MVP, a single environment — `dev` — is sufficient. Production environment is added when ready to launch.

---

## 8. Deployment Architecture

### 8.1 CI/CD Pipeline

```mermaid
flowchart LR
    A[Developer] -->|git push| B[GitHub Repository]
    B -->|GitHub Actions trigger| C[Build Step]
    C -->|npm run build - frontend| D[Static Assets]
    C -->|npm run build - api| E[Function Bundle]
    D --> F[SWA Deploy Action]
    E --> F
    F -->|Deploy| G[Azure Static Web Apps]
```

### 8.2 Repository Structure

```
WhiskyApp/
├── .github/
│   └── workflows/
│       └── azure-static-web-apps.yml
├── src/                          — Frontend source
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── services/
│   ├── types/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.html
├── api/                          — Azure Functions API
│   ├── src/
│   │   ├── functions/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── models/
│   │   └── utils/
│   ├── host.json
│   ├── local.settings.json
│   ├── package.json
│   └── tsconfig.json
├── staticwebapp.config.json      — SWA configuration
├── package.json                  — Frontend dependencies
├── tsconfig.json                 — Frontend TypeScript config
├── vite.config.ts                — Vite configuration
├── context/                      — Project documentation
└── README.md
```

---

## 9. Future Architecture Considerations

These are not part of the MVP but inform architectural decisions:

- **Image Storage**: Azure Blob Storage for whiskey bottle images — add when needed
- **Search**: Azure Cognitive Search for whiskey discovery — add when catalog grows
- **Caching**: Azure CDN or Redis Cache — add when traffic justifies it
- **Monitoring**: Azure Application Insights — add for production readiness
- **Multiple OAuth Providers**: Migrate to Azure AD B2C when needed
- **Real-time Updates**: Azure SignalR Service for live rating updates during events
