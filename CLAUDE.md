# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhiskyApp ("viski-ilta") records and ranks whisky ratings from tasting events. React SPA on Azure Static Web
Apps (SWA), Azure Functions v4 API as SWA managed functions, Azure Cosmos DB (serverless), Azure Blob Storage
for bottle photos, optional Claude-based bottle recognition. Bilingual (fi default, en).

`frontend/` and `api/` are two independent npm packages (no workspaces). Install and run each separately; the
root `package.json` only chains them. `scripts/` is a third standalone package for one-off data import.

## Commands

Install: `cd api && npm ci` and `cd frontend && npm ci` (root `npm install` only pulls `concurrently`).

### Root
- `npm run dev` — frontend (Vite, :5173) and API (`func start`, :7071) via `concurrently`
- `npm run build` / `npm run lint` / `npm test` / `npm run test:coverage` — run both packages, frontend first
  for build/lint, API first for tests
- `npm run typecheck` — `api` build (emits `api/dist/`) + `api` test typecheck + frontend `typecheck` +
  frontend `typecheck:test`. Mirrors what CI runs.
- `npm run import-data` — `scripts/import-excel.ts` via tsx (needs `scripts/` deps and a `.env` with Cosmos creds)

### API (`api/`)
- `npm run build` — `tsc` to `api/dist/` (this is also the production typecheck; CI runs it)
- `npm run dev` — `predev` builds, then `func start` (requires Azure Functions Core Tools v4 and
  `api/local.settings.json`)
- `npm run lint` — ESLint with `--max-warnings 21`. The 21 existing warnings are all
  `@typescript-eslint/no-explicit-any` around the Cosmos SDK. The budget is exactly used up: **any new `any`
  fails lint**, and removing one lowers the bar for the next person (adjust the flag if you do).
- `npm test` / `npm run test:watch` / `npm run test:coverage` — Vitest, `test/**/*.test.ts`, thresholds
  70/70/70 lines/statements/functions, 60 branches
- `npm run typecheck:test` — `tsc -p tsconfig.test.json --noEmit` (covers `src` + `test`)
- Single file: `npx vitest run test/lib/response.test.ts`; single case: add `-t "name substring"`

### Frontend (`frontend/`)
- `npm run dev` — Vite dev server; proxies `/api` to `http://localhost:7071`
- `npm run build` — `tsc && vite build` to `frontend/dist/`
- `npm run lint` — ESLint, `--max-warnings 0`
- `npm run typecheck` — `tsc --noEmit` over production `src` only (`tsconfig.json` excludes `*.test.ts(x)` and
  `src/test/**`); `npm run typecheck:test` covers them via `tsconfig.test.json`
- `npm test` / `npm run test:watch` / `npm run test:coverage` — Vitest + jsdom, `src/**/*.test.{ts,tsx}`,
  thresholds 60/60/60/55. Config lives in the `test` block of `vite.config.ts` (no separate vitest config).
- Single file: `npx vitest run src/lib/password.test.ts`; single case: add `-t "name substring"`

Prettier (`.prettierrc`: single quotes, trailing commas, 80 cols) is enforced through ESLint
(`prettier/prettier: error`) in both packages, so formatting drift fails lint.

### Local setup
1. Copy `api/local.settings.json.example` to `api/local.settings.json`. Defaults enable `USE_COSMOS_MOCK` and
   `USE_BLOB_MOCK`, so no Azure resources are needed. Set `AUTH_SESSION_SECRET` to a 32+ byte string or native
   sign-in fails closed (register/login return 500).
2. Optionally copy `.env.example` to `frontend/.env.local`. Leave `VITE_API_BASE_URL` unset unless bypassing
   the SWA CLI (an absolute URL skips the SWA auth header injection).
3. The Cosmos mock seeds an admin user with `id: 'admin'`. SWA/Entra sign-in does not work under plain Vite;
   either use the SWA CLI (`swa start`, :4280) or native username/password sign-in, which works locally.

## Architecture

### Request flow and auth
- SWA routes `/api/*` to the Functions app with `allowedRoles: ["anonymous"]` for every route
  (`staticwebapp.config.json`). **All authorization is done in the API code**, never by SWA roles.
- Two identity sources resolve into one `ClientPrincipal` (`api/src/lib/auth.ts` `resolvePrincipal`):
  - Entra ID via the `x-ms-client-principal` header SWA injects (`identityProvider: 'aad'`).
  - Native accounts via the `whisky_session` HttpOnly cookie, an HS256 JWT signed with `AUTH_SESSION_SECRET`
    (`api/src/lib/session.ts`, `identityProvider: 'local'`, user ids `local:<uuid>`). `readSession` rejects a
    token whose `sessionVersion` no longer matches the `credentials` doc (password change/reset signs out
    older sessions). Sessions issued for an admin-assigned temporary password carry `mustChangePassword` and
    are invisible to every endpoint except `POST /api/auth/change-password`.
- App roles `anonymous` | `taster` | `admin` live on the Cosmos `users` document, created lazily with role
  `anonymous` by `ensureUser` on first authenticated request (ETag-retry loop; also backfills legacy docs).
  `requireTaster` accepts taster or admin; `requireAdmin` admin only. There is no SWA-level role mapping, and
  the first admin is bootstrapped by hand in Cosmos (see `docs/deployment.md` §4).
- Write rule used across `events.ts` and `whiskeys.ts`: any taster can create; edit/delete requires
  `isAdmin(principal) || resource.createdByUserId === principal.userId`.
- Handlers throw plain `{ statusCode, message }` objects; `handleError` in `api/src/lib/response.ts` maps
  them to the JSON error envelope `{ error, message, statusCode }`. Success bodies are `{ data, message? }`
  (`ok`/`created`), which the frontend API modules unwrap as `response.data.data`.

### API layout (`api/src`)
- `index.ts` imports `./polyfill` first (Web Crypto for the Cosmos SDK), then each `functions/*.ts` module for
  its `app.http(...)` registrations. Every handler is an exported async function registered at the bottom of
  its file so tests call it directly.
- `lib/cosmos.ts` `getContainer(name)` is the single data seam. `USE_COSMOS_MOCK=true` swaps in the lenient,
  pre-seeded dev mock `lib/cosmos.mock.ts`. `lib/blob.ts` `getBlobStore()` is the same pattern for photos
  (`USE_BLOB_MOCK`). `health.ts` builds its own `CosmosClient` and bypasses the seam.
- `lib/aggregates.ts`: ratings are denormalized. Every rating upsert/delete calls `recomputeEventAggregate`
  (patches `averageRating`/`ratingCount` on the `eventWhiskeys` link) and `recomputeGlobalAggregate` (patches
  `globalAverageRating`/`globalRatingCount` on `whiskeys`). The global query is cross-partition because
  `ratings` is partitioned by `/eventId`.
- `lib/ai.ts`: Claude vision + web search restricted to `SEARCH_ALLOWED_DOMAINS`, with a ~40 s budget because
  SWA managed functions time out around 45 s. Returns 503 when `ANTHROPIC_API_KEY` is unset.

### Cosmos containers (all created by `infra/modules/cosmosdb.bicep`)
| Container | Partition key | Notes |
|---|---|---|
| `events` | `/id` | `whiskeyCount` maintained on link add/remove |
| `whiskeys` | `/id` | Global catalog; `imageBlobName`/`imageContentType`/`imageUpdatedAt` for photos |
| `eventWhiskeys` | `/eventId` | Link doc with event-scoped aggregates |
| `ratings` | `/eventId` | One per (event, whiskey, user); `score` 0-10 |
| `users` | `/id` | Profile + app role + `usernameConfirmed` + `authProvider` |
| `credentials` | `/id` = lowercased username | bcrypt hash, lockout state, `sessionVersion`, `userId` |

### Routes (all under `/api`)
- `events`: GET list, POST (taster); `events/{eventId}`: GET, PATCH, DELETE (creator/admin)
- `whiskeys`: GET catalog sorted by global average, POST (taster); `whiskeys/{whiskeyId}`: GET, PATCH, DELETE
- `whiskeys/{whiskeyId}/image`: GET (public, cached immutable, frontend appends `?v=<imageUpdatedAt>`), PUT raw
  image body (JPEG/PNG/WebP, 5 MB, creator/admin), DELETE
- `whiskeys/recognize?lang=en|fi`: POST image, taster, AI recognition
- `events/{eventId}/whiskeys`: GET, POST link; `events/{eventId}/whiskeys/{whiskeyId}`: GET, DELETE
- `events/{eventId}/whiskeys/{whiskeyId}/ratings`: GET; `.../ratings/me`: PUT, DELETE (taster);
  `whiskeys/{whiskeyId}/ratings`: GET across events
- `users/me`: GET, PUT; `users`: GET; `users/{id}/role`: PUT; `users/{id}`: DELETE (keeps ratings/whiskeys,
  admins cannot delete themselves); `users/{id}/reset-password`: POST (native accounts, 24 h temp password)
- `auth/register`, `auth/login`, `auth/logout`, `auth/me`, `auth/change-password`; `health`

### Frontend (`frontend/src`)
- `@` alias → `src`. Routing in `App.tsx`; `ProtectedRoute` (exported as `TasterRoute`) and `AdminRoute`
  guard pages. Pages are thin over TanStack Query hooks in `hooks/`, which call the axios modules in `api/`.
- `hooks/useAuth.ts` is two layers: identity (SWA `/.auth/me` first, then native `/api/auth/me`; SWA sometimes
  returns masked `userDetails` like `vil*****`, which is retried) and authorization from `GET /api/users/me`.
  `isAdmin`/`isTaster` come only from the DB role; `User.role` on the identity object is a legacy field.
- `api/client.ts` redirects to `/login` on any 401 except `/auth/*` endpoints, so login forms can show
  bad-credential errors inline.
- `usernameConfirmed === false` on the profile triggers `UsernameSetupModal`; a `mustChangePassword` session
  routes to `/change-password`.
- Photos: `components/WhiskeyImageField.tsx` (picker + "Recognize with AI"), `lib/image.ts` downscales to
  1280 px JPEG client-side, `lib/recognize.ts` fills only empty form fields from the AI result.
- i18n via i18next, `fallbackLng: 'fi'`, language stored in `localStorage['lang']`. `i18n/locales.test.ts`
  enforces full key parity between `en.json` and `fi.json` and no empty strings, so every new string needs
  both files. CSS Modules for styling.

## Testing conventions

### API (`api/test/`, never under `api/src/`)
- `tsc` compiles all of `src/**` into `dist/`, and the SWA workflows deploy `api/` with `skip_api_build: true`,
  so a test under `src` would ship to production.
- `test/fakes/cosmos.ts` (`createFakeCosmos`) is the hardened test fake, distinct from the dev mock: starts
  empty, **throws on any SQL it does not recognize** (extend its evaluator when you add a new query string;
  never make it lenient), enforces ETag `ifMatch` (412), and rejects patch ops other than
  `set`/`incr`/`add`/`remove`. It records `enableCrossPartitionQuery` so tests can assert it.
- Per test file:
  ```ts
  import { fakeCosmos } from '../helpers/mockCosmos';
  vi.mock('../../src/lib/cosmos', () => ({ getContainer: (name: string) => fakeCosmos.getContainer(name) }));
  beforeEach(() => fakeCosmos.reset());
  ```
  Same shape for photos with `fakeBlob` from `helpers/mockBlob.ts` and `vi.mock('../../src/lib/blob', ...)`.
  Never set `USE_COSMOS_MOCK` in tests.
- `helpers/request.ts`: `makeRequest({ params, query, body, rawBody, principal, cookies, headers })`,
  `makeContext()`, `makePrincipal(overrides)`, `readJson(response)`. Call handlers directly.
- `test/lib/ai.test.ts` mocks `@anthropic-ai/sdk`; `test/functions/health.test.ts` mocks `@azure/cosmos`.
- Coverage excludes `src/index.ts`, `src/polyfill.ts`, `src/lib/cosmos.mock.ts`. `cosmos.ts` itself is always
  mocked and has no direct coverage.

### Frontend (colocated `*.test.ts(x)`)
- `src/test/setup.ts`: jest-dom matchers, `matchMedia` and `Blob.prototype.stream` polyfills, MSW server with
  `onUnhandledRequest: 'error'` (an unstubbed request fails the test), RTL `cleanup`.
- `src/test/handlers.ts` holds anonymous/empty defaults; override per test with `server.use(...)`.
- `src/test/renderWithProviders.tsx` wraps in `MemoryRouter` + a fresh `QueryClient` (`retry: false`,
  `gcTime: 0`) and accepts `{ route, language }`.
- Coverage deliberately excludes `App.tsx` and the presentational pages (`EventsPage`, `EventDetailPage`,
  `CatalogWhiskeyDetailPage`, `RankingPage`, `NotFoundPage`); see `docs/adr/0001-unit-test-coverage.md`.

## CI and deployment
- `.github/workflows/ci.yml`: on every PR and on push to `main`/`dev`, runs lint, build/typecheck, test
  typecheck, and coverage-gated tests per package (API on Node 20, frontend on Node 22).
- `claude-code-review.yml` runs an automated code review on non-draft PRs.
- `azure-static-web-apps-dev.yml` deploys on push to `dev`; `azure-static-web-apps.yml` (prod) and
  `infra-deploy.yml` (Bicep, `infra/`) are manual `workflow_dispatch`. Both SWA workflows build locally and
  upload `frontend/dist` + `api/` with app and API builds skipped.
- `staticwebapp.config.json` exists at the repo root and in `frontend/public/` (copied into `dist`). Keep them
  in sync when changing routes or headers.
- Infra secrets and app settings are documented in `infra/README.md`; the SWA app-settings resource replaces
  the whole set on each deploy.

## Working rules (from `.rules/`)
`.rules/01-agent-rules.md` and `.rules/02-workspace-rules.md` are the workspace's agent guidelines. The
concrete ones that matter here: write tests before or with the change and keep them passing; keep files under
~500 lines and refactor proactively; record significant technical decisions as ADRs in `docs/adr/` (numbered,
Status/Context/Decisions); do not commit one-time scripts; enforce validation and authorization server-side.
`plans/` and `journal/` referenced from `docs/INDEX.md` are gitignored local working directories.

## Documentation
- `docs/INDEX.md` — index of all docs
- `docs/architecture.md` — system architecture, data flow, Azure resources
- `docs/deployment.md` — Azure setup, CI/CD, admin bootstrap, troubleshooting
- `docs/adr/` — 0001 test strategy, 0002 bottle photos + AI recognition, 0003 native auth
- `infra/README.md` — Bicep deploy steps and required GitHub secrets/environments
