# ADR 0001: Unit Test Coverage Strategy

## Status

Accepted

## Context

WhiskyApp had zero test infrastructure across both `api/` (Azure Functions) and `frontend/` (React SPA): no
runner, no config, no test files, and no CI test gate. This violated the TDD mandate in
`.rules/02-workspace-rules.md`. Full context and the phased implementation plan are recorded in
`plans/unit-test-coverage.md`.

Adding coverage required several concrete decisions:

1. Which test runner to use.
2. How to isolate the API's Cosmos DB dependency for fast, deterministic unit tests.
3. How to isolate the frontend's HTTP boundary (axios via TanStack Query hooks).
4. What initial coverage thresholds to enforce, and where.

## Decisions

### Vitest over Jest

Both packages use Vitest 3.x, configured independently (no shared monorepo workspace tooling — each package has
its own `vitest.config.ts` / `vite.config.ts` `test` block). Vitest was chosen over Jest because:

- The frontend already uses Vite; Vitest reuses its transform pipeline, aliasing (`@` → `src`), and TypeScript
  handling with no separate Babel/ts-jest configuration.
- The API is plain TypeScript/Node without a bundler, but Vitest's esbuild-based transform is fast and needs no
  additional Jest-specific TypeScript preset.
- Native ESM/TS support avoids the CommonJS/ESM interop friction that Jest requires extra configuration for.

### A hardened, test-only Cosmos DB fake — not the dev mock, not the emulator

`api/src/lib/cosmos.mock.ts` already existed as a dev-time fake, but it is unsuitable for tests as-is: it is
pre-seeded with fixed data (2 events, 7 whiskeys, 11 ratings, etc.) in shared module-level state, and its SQL
evaluator silently returns `[]` for any query it doesn't understand — which would let a real handler bug produce a
green test.

A new fake, `api/test/fakes/cosmos.ts`, was built specifically for tests:

- **Starts empty.** Every test seeds exactly the documents it needs via `fakeCosmos.seed(...)`.
- **Fails loudly.** The query evaluator matches a single strict regex covering exactly the `SELECT`/`WHERE`/
  `ORDER BY`/`TOP`/`OFFSET…LIMIT` shapes that appear under `api/src`; anything else throws instead of returning an
  empty array.
- **Supports ETag optimistic concurrency** (`accessCondition.ifMatch`, throws `{ code: 412 }` on mismatch) so the
  retry loops in `users.ts` (role changes) and `auth.ts` (`ensureUser` backfill) are actually exercised.
- **Throws on any patch op outside `set`/`incr`/`add`/`remove`.** This is what caught the `op: 'increment'` bug in
  `whiskeys.ts` (see Consequences) — `'increment'` was never a valid Cosmos `PatchOperationType`.
- Enforces partition-key matching in `item(id, partitionKey)`, so a cross-partition read mistake fails instead of
  silently succeeding.

The Azure Cosmos DB emulator was considered and rejected for unit tests: it requires a running service, is slow
to start, and is unnecessary for testing handler logic in isolation. It remains a candidate for a future
integration-test suite (see Follow-ups in the plan).

Handlers are mocked at the `getContainer` seam via `vi.mock('../lib/cosmos', ...)`, with all 21 route handlers
(plus the `insertCatalogWhiskey` helper) exported from their function files for direct unit testing —
`app.http(...)` registrations are unchanged.

### MSW over module mocks (frontend)

The frontend intercepts HTTP at the network boundary using MSW v2 (`setupServer` from `msw/node`) rather than
mocking `axios` or the `src/api/*.ts` client modules directly. This means:

- API client tests (`src/api/*.test.ts`) exercise the real axios instance and interceptors against a mocked
  network layer, catching URL/method/body/envelope-unwrapping mistakes that a module mock would hide.
  `src/api/client.test.ts` also covers the 401 → `/.auth/login/aad` redirect interceptor (with `window.location`
  stubbed and restored per test, since jsdom doesn't implement navigation).
- Hook and component tests share the same default handlers (`src/test/handlers.ts`, anonymous/empty by default)
  and override per test with `server.use(...)`.
- `onUnhandledRequest: 'error'` is deliberate: a request a test forgot to stub fails loudly instead of hanging or
  silently passing through.

### Initial coverage thresholds, with an explicit ratchet-up intent

- API: lines/statements/functions 70%, branches 60% (`api/vitest.config.ts`).
- Frontend: lines/statements/functions 60%, branches 55% (`frontend/vite.config.ts`).

These are starting points, not target ceilings — see Follow-ups. Both configs exclude files that are either
side-effect-only entry points (`src/index.ts`, `src/polyfill.ts`, `src/main.tsx`, `App.tsx`) or explicitly out of
this plan's "logic-heavy subset only" scope for component/page testing (the dev-only `cosmos.mock.ts`, and the
frontend's largely presentational pages: `EventsPage`, `EventDetailPage`, `CatalogWhiskeyDetailPage`,
`RankingPage`, `UserManagementPage`, `NotFoundPage`). `WhiskeyDetailPage` is tested for its 0–10 score selector
only, which was the highest-risk logic in that file (score `0` must not be dropped as falsy).

## Consequences

- **Found and fixed a real bug during implementation.** `whiskeys.ts:325` used `op: 'increment'` in a Cosmos patch
  operation, which is not a valid `PatchOperationType`. It only "worked" because `getContainer()`'s mock branch
  returned `as any`, disabling patch-op typechecking. The practical effect: deleting a catalog whiskey silently
  failed to decrement `whiskeyCount` on every event it had been linked to. A regression test was written first
  against the hardened fake, confirmed failing, then the fix (`'increment'` → `'incr'`) was applied and the test
  passes. This is a live behavior change — events that were affected before this fix may have a stale
  `whiskeyCount` that needs a one-time backfill (tracked as a follow-up, not part of this change).
- **Discovered `npm run lint` had never actually passed in this repo.** No CI gate existed, and API `node_modules`
  weren't installed in a fresh checkout, so `@typescript-eslint/no-unused-vars` (missing `argsIgnorePattern: '^_'`
  for the `_req`/`_ctx` convention already used throughout) and ~20 pre-existing `@typescript-eslint/no-explicit-any`
  warnings around Cosmos SDK typing had never been caught. The unused-vars config gap was fixed outright; the
  `no-explicit-any` debt was downgraded to a capped warning baseline (`--max-warnings 21`) rather than retyped, to
  avoid touching untested production code as an unplanned side effect of this work.
- Two packages means two sets of test tooling to maintain (no shared Vitest config), but each stays simpler and
  more directly tied to its own runtime environment (`node` vs `jsdom`).
- CI (`.github/workflows/ci.yml`) now gates every PR and push to `main`/`dev` on lint + typecheck + coverage for
  both packages, uploading coverage as a build artifact. The existing Azure Static Web Apps deploy workflows are
  untouched.

## Follow-ups (tracked in `plans/unit-test-coverage.md`, not this change)

- Backfill correction for existing events whose `whiskeyCount` drifted due to the `increment` no-op.
- Split `api/src/functions/whiskeys.ts` (772 lines) to satisfy the workspace 500-line file limit.
- Ratchet coverage thresholds upward as the actuals stabilize; consider mutation testing on `lib/aggregates.ts`.
- Retype the pre-existing `no-explicit-any` usages around the Cosmos SDK once handler tests exist to catch
  regressions from doing so.
- A future integration-test suite against the real Cosmos DB emulator (or SWA CLI + Playwright), if end-to-end
  confidence beyond unit tests becomes a priority.
