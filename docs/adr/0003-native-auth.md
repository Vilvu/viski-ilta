# ADR 0003: Native Username/Password Sign-In

## Status

Accepted

## Context

Sign-in was only possible through Azure Static Web Apps (SWA) built-in auth with Microsoft Entra ID
(`/.auth/login/aad`), so anyone without a Microsoft account could not sign in. We want an additional, native
option where users create their own username and password, with open sign-up. Entra ID stays available.

Constraints:

1. SWA runs on the **Free tier** (`infra/modules/staticwebapp.bicep`). Custom OpenID Connect providers are a
   Standard-tier feature, so the identity can't come from SWA. Native auth has to be managed by the app.
2. The API trusts SWA's `x-ms-client-principal` header everywhere (`requireAuth`, `ensureUser`,
   `requireTaster`/`requireAdmin`). Native auth should not need every function to change.
3. API code is compiled with `tsc` and deployed with `skip_api_build: true`. Native-binary npm packages (e.g.
   `argon2`, `bcrypt`) are a deployment risk.

## Decisions

### App-issued session cookie resolved into the same `ClientPrincipal`

`api/src/lib/session.ts` issues an HS256-signed JWT (sub = user id, name = username, 7-day expiry) in an
`HttpOnly; Secure; SameSite=Strict` cookie named `whisky_session`. `resolvePrincipal()` in `api/src/lib/auth.ts`
returns SWA's header principal when present. Otherwise it verifies the cookie and returns a `ClientPrincipal` with
`identityProvider: 'local'`. `requireAuth` (now async) uses it, so all existing role checks and `users` documents
work unchanged. Native users are `users` docs with id `local:<uuid>`, `email: ''`, `authProvider: 'local'`, and
role `anonymous` until an admin promotes them, the same as Entra users.

The signing key is the `AUTH_SESSION_SECRET` app setting. If it is missing, native sign-in fails closed: cookies
don't verify and the register/login endpoints return 500.

### `credentials` container keyed by lowercased username

Password hashes live in a separate `credentials` container (pk `/id`, id = lowercased username), never in
`users`, so they can't leak through the user-listing endpoints. Using the username as the id makes uniqueness
atomic and case-insensitive: a duplicate `create` returns a Cosmos 409.

### Libraries

- `jose` (v5, CommonJS-compatible): JWT signing and verification.
- `bcryptjs`: pure-JS bcrypt (cost 10), so there's no native build step. Passwords are 8–72 bytes (bcrypt's
  input limit).
- `cookie`: parses the request `Cookie` header. Responses use Azure Functions v4's built-in `cookies` field.

### Abuse controls

Login returns a generic "Invalid username or password" for both an unknown user and a wrong password, and still
runs a bcrypt compare for unknown users so the timing doesn't reveal which. After 5 consecutive failures the
account locks for 15 minutes (HTTP 429). Wrong current passwords on `POST /api/auth/change-password` count
toward the same lockout, and that endpoint also rejects a temporary password once it has expired, even from a
session that is still valid. `SameSite=Strict` plus JSON-only request bodies covers CSRF.

## Consequences

- Two identity sources coexist. The frontend's `useIdentity` checks `/.auth/me` first and then `/api/auth/me`.
  Sign-out is `/.auth/logout` for Entra users and `POST /api/auth/logout` for native users.
- A native account and an Entra account belonging to the same person are separate users. There is no account
  linking.
- There's no self-service "forgot password" or email recovery, since native accounts have no email. Instead an
  admin resets the password in User Management (`POST /api/users/{id}/reset-password`). That issues a random
  12-character temporary password, shown to the admin once, that expires after 24 hours. Signing in with it gives
  a restricted session (`pwc` claim) that `getSessionPrincipal` ignores, so every endpoint except
  `POST /api/auth/change-password` treats the user as signed out until they choose a new password. An admin can also
  remove the user (`DELETE /api/users/{id}`), which deletes their `credentials` and `users` documents so the person
  can re-register.
- A removed native user's session cookie stays cryptographically valid until it expires, so `ensureUser` never
  auto-provisions a `local` principal (it returns 401 instead), and `GET /api/auth/me` reports such a session as
  signed out and clears the cookie.
- Sessions are JWTs, but each carries the account's `sessionVersion` (stored in `credentials`), and `readSession`
  checks it on every native request with one point read. A password reset or change bumps the version, which
  signs out that user's other sessions; changing your own password keeps the current session. Rotating
  `AUTH_SESSION_SECRET` still signs out every native user at once.
- Moving to SWA Standard (custom OIDC) or Entra External ID later remains possible. `resolvePrincipal` is the
  single seam to change.
