# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhiskyApp is a web application for recording and tracking user whisky ratings from whisky tasting events. Built on Microsoft Azure serverless architecture.

## Commands

### Root
- `npm run dev` — Start both frontend and API concurrently using `concurrently`
- `npm run build` — Build both frontend and API
- `npm run lint` — Lint both frontend and API
- `npm test` — Run both packages' test suites (`api` then `frontend`)
- `npm run test:coverage` — Run both test suites with coverage thresholds enforced
- `npm run typecheck` — Typecheck both packages' production source and test files
- `npm run import-data` — Import data from Excel (runs scripts/import-excel.ts)

### Frontend (frontend/)
- `npm run dev` — Start Vite dev server (port 5173)
- `npm run build` — TypeScript check + Vite build (outputs to `frontend/dist/`)
- `npm run lint` — ESLint check
- `npm run preview` — Preview production build
- `npm test` — Run Vitest once (`src/**/*.test.{ts,tsx}`)
- `npm run test:watch` — Run Vitest in watch mode
- `npm run test:coverage` — Run Vitest with v8 coverage (thresholds: 60/60/60/55)
- `npm run typecheck` — `tsc --noEmit` over production `src` (test files excluded)
- `npm run typecheck:test` — Typecheck test files via `tsconfig.test.json`

### API (api/)
- `npm run build` — TypeScript compile
- `npm run dev` — Run Azure Functions Core Tools (`func start`) — requires local.settings.json
- `npm run lint` — ESLint check
- `npm test` — Run Vitest once (`test/**/*.test.ts`)
- `npm run test:watch` — Run Vitest in watch mode
- `npm run test:coverage` — Run Vitest with v8 coverage (thresholds: 70/70/70/60)
- `npm run typecheck:test` — Typecheck test files via `tsconfig.test.json`

### Development Setup
1. `cd frontend && npm install`
2. `cd ../api && npm install`
3. Copy `api/local.settings.json.example` to `api/local.settings.json` and configure Cosmos DB credentials
4. Copy `.env.example` to `frontend/.env.local` if needed

## Architecture

### High-Level Stack
- **Frontend**: React 18 + TypeScript + Vite → Azure Static Web Apps
- **Backend**: Azure Functions v4 (Node.js 20) via SWA managed functions
- **Database**: Azure Cosmos DB (NoSQL, serverless)
- **Auth**: Azure Static Web Apps built-in auth (Microsoft Entra ID) or native username/password accounts (app-managed session cookie) for sign-in; app-managed roles (`anonymous`/`taster`/`admin`) stored in Cosmos DB

### Project Structure
```
whisky-app/
├── frontend/          # React SPA
│   ├── src/
│   │   ├── api/       # API client modules (events, ratings, users, whiskeys)
│   │   ├── components/ # Reusable UI (Layout, Auth, Modals)
│   │   ├── hooks/     # TanStack Query hooks (useAuth, useEvents, etc.)
│   │   ├── pages/     # Route pages
│   │   ├── i18n/      # i18n (en.json, fi.json)
│   │   └── App.tsx    # Routes
├── api/               # Azure Functions
│   ├── src/
│   │   ├── functions/ # auth.ts, events.ts, ratings.ts, users.ts, whiskeys.ts, health.ts
│   │   └── lib/       # cosmos.ts, cosmos.mock.ts, auth.ts, session.ts, response.ts, aggregates.ts, blob.ts, ai.ts
├── docs/              # Architecture & deployment docs
└── staticwebapp.config.json
```

### Data Model (Cosmos DB)
- `events` (pk: `/id`) — Tasting events
- `whiskeys` (pk: `/id`) — Catalog of whiskeys (global); optional bottle photo fields `imageBlobName`,
  `imageContentType`, `imageUpdatedAt` (photo bytes live in Blob Storage container `whiskey-images`)
- `eventWhiskeys` (pk: `/eventId`) — Links whiskey to event with event-scoped aggregates
- `ratings` (pk: `/eventId`) — User ratings per event/whiskey
- `users` — App-managed user profiles with roles
- `credentials` (pk: `/id` = lowercased username) — Native account password hashes and lockout state

### API Routes
- `GET/POST /api/events` — List/create events (admin only for POST)
- `GET /api/whiskeys` — Catalog list by global average rating
- `GET/PUT/DELETE /api/whiskeys/:whiskeyId/image` — Bottle photo (raw image body on PUT; creator/admin for writes)
- `POST /api/whiskeys/recognize?lang=en|fi` — AI bottle recognition (Claude + scoped web search); 503 without `ANTHROPIC_API_KEY`
- `GET/POST /api/events/:eventId/whiskeys` — Event whiskey links
- `PUT/DELETE /api/events/:eventId/whiskeys/:whiskeyId/ratings/me` — User ratings
- `GET/PUT /api/users/me` — User profile
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — Native accounts

### Auth & Roles
- Sign-in page at `/login`: native username/password (open sign-up) or `/.auth/login/aad` (Microsoft Entra ID)
- Auth context passed via `x-ms-client-principal` header (Entra ID) or the `whisky_session` cookie (native; HS256 JWT
  signed with `AUTH_SESSION_SECRET`). `resolvePrincipal()` in `api/src/lib/auth.ts` turns either into the same
  `ClientPrincipal` (`identityProvider: 'local'` for native), so `requireAuth`/`requireTaster`/`requireAdmin` are
  provider-agnostic. See `docs/adr/0003-native-auth.md`
- Roles are app-managed in Cosmos DB `users` container, not SWA roles
- First admin must be bootstrapped manually in Cosmos DB (see docs/deployment.md §4.2)

### Local Development Notes
- Vite proxies `/api` to `http://localhost:7071`
- Set `USE_COSMOS_MOCK=true` in `api/local.settings.json` for mock DB (seeds admin user `id: 'admin'`)
- Set `USE_BLOB_MOCK=true` for in-memory photo storage; otherwise `BLOB_STORAGE_CONNECTION_STRING` is required
- `ANTHROPIC_API_KEY` is optional; without it AI recognition returns 503 and the UI says it is not configured
- SWA auth doesn't work locally; use SWA CLI or mock `x-ms-client-principal` header. Native sign-in works locally
  once `AUTH_SESSION_SECRET` is set in `api/local.settings.json`

### Key Files
- `api/src/lib/cosmos.ts` — Cosmos DB connection (switches to mock via env var)
- `api/src/lib/cosmos.mock.ts` — In-memory mock with seeded data
- `api/src/lib/blob.ts` — Bottle photo storage seam (Azure Blob Storage, or in-memory via `USE_BLOB_MOCK`)
- `api/src/lib/ai.ts` — AI bottle recognition (Claude vision, web search limited to whisky reference sites)
- `frontend/src/components/WhiskeyImageField.tsx` — Photo picker + "Recognize with AI" used by add/edit forms;
  `frontend/src/lib/image.ts` downscales photos client-side, `frontend/src/lib/recognize.ts` fills only empty fields
- `api/src/lib/auth.ts` — Client principal parsing (SWA header or native session), role checking
- `api/src/lib/session.ts` — Native session JWT + cookie helpers
- `api/src/functions/auth.ts` — Native register/login/logout/session endpoints
- `staticwebapp.config.json` — SWA routing, navigation fallback, security headers
- `frontend/src/App.tsx` — Application routes with ProtectedRoute/AdminRoute guards

## Testing

Both packages use Vitest, run and configured independently (no monorepo workspace tooling). A GitHub Actions
workflow (`.github/workflows/ci.yml`) runs lint, typecheck, and coverage-gated tests for both packages on every
pull request and on push to `main`/`dev`. It does not touch the Azure Static Web Apps deploy workflows.

### API (`api/test/`)
- Tests live under `api/test/`, never under `api/src/` — `tsc` compiles `src/**/*` into `api/dist/`, which is what
  the SWA workflow deploys (`skip_api_build: true`), so a test file under `src` would ship to production.
- `api/test/fakes/cosmos.ts` is a hardened, test-only in-memory Cosmos DB fake (`createFakeCosmos()`), separate from
  the dev-only `src/lib/cosmos.mock.ts`. It starts empty (no seeded data), throws on any SQL syntax it doesn't
  recognize instead of silently returning `[]`, implements ETag optimistic concurrency (`accessCondition.ifMatch`,
  412 on mismatch), and throws on any patch op outside `set`/`incr`/`add`/`remove`.
- Mock the data seam per test file with `vi.mock('../../src/lib/cosmos', () => ({ getContainer: (name) =>
  fakeCosmos.getContainer(name) }))`, importing the shared `fakeCosmos` singleton from `api/test/helpers/mockCosmos.ts`.
  Call `fakeCosmos.reset()` in `beforeEach`. Never let `USE_COSMOS_MOCK` be set during tests — its shared
  module-level seed data would cross-contaminate.
- `health.ts` builds its own `CosmosClient` instead of using `getContainer`, so its test mocks `@azure/cosmos`
  directly.
- `api/test/helpers/request.ts` provides `makeRequest`/`makeContext`/`makePrincipal`/`readJson` stubs for calling
  exported handler functions directly (every handler in `events.ts`/`ratings.ts`/`users.ts`/`whiskeys.ts`/`health.ts`
  is exported for this purpose; `app.http(...)` registrations are unchanged).
- Photo storage is mocked the same way: `vi.mock('../../src/lib/blob', () => ({ getBlobStore: () => fakeBlob }))`
  with `fakeBlob` from `api/test/helpers/mockBlob.ts` (call `fakeBlob.reset()` in `beforeEach`). `makeRequest`
  accepts `rawBody` for image uploads. `api/test/lib/ai.test.ts` mocks `@anthropic-ai/sdk`; never call the real API.

### Frontend (`frontend/src/**/*.test.{ts,tsx}`, colocated with source)
- `frontend/src/test/setup.ts` polyfills `Blob.prototype.stream` (jsdom lacks it; MSW needs it for photo uploads) and wires up `@testing-library/jest-dom`, an MSW `server` lifecycle
  (`onUnhandledRequest: 'error'` — an unstubbed request fails the test instead of hanging), RTL `cleanup()`, and a
  `matchMedia` polyfill (jsdom doesn't implement it; `Layout.tsx` uses it for the mobile nav).
- `frontend/src/test/handlers.ts` has the default (anonymous/empty) MSW handlers; override per test with
  `server.use(...)`.
- `frontend/src/test/renderWithProviders.tsx` wraps a component in `MemoryRouter` + `QueryClientProvider` with a
  **fresh** `QueryClient` per test (`retry: false`, `gcTime: 0`) so TanStack Query never caches or retries across
  tests.
- Production typecheck (`tsc --noEmit`, run by `npm run build`) excludes `*.test.ts(x)` and `src/test/**`;
  `tsconfig.test.json` typechecks them separately.

### Known coverage gaps (deliberate, see `plans/unit-test-coverage.md`)
- `api/src/lib/cosmos.ts` is always mocked in tests, so it has no direct coverage of its own.
- `frontend/src/App.tsx` (route wiring) and the presentational pages (`EventsPage`, `EventDetailPage`,
  `CatalogWhiskeyDetailPage`, `RankingPage`, `UserManagementPage`, `NotFoundPage`) are excluded from the frontend
  coverage thresholds — only `WhiskeyDetailPage`'s score selector is tested, per the "logic-heavy subset only" scope
  decision.

## Documentation
- `docs/architecture.md` — System architecture, data flow, security
- `docs/deployment.md` — Azure setup, CI/CD, local dev, troubleshooting
- `README.md` — Quick start guide

## Important Notes
- App is bilingual (en/fi) via i18next
- Frontend uses TanStack Query for server state
- CSS Modules used for component styling
- Build artifacts: `frontend/dist/` and `api/dist/`
- Cosmos DB serverless: charges per RU, ~$0-2/month for MVP
