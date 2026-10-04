import type { Cookie, HttpRequest } from '@azure/functions';
import { parse as parseCookies } from 'cookie';
import { SignJWT, jwtVerify } from 'jose';
import type { ClientPrincipal } from './auth';
import { getContainer } from './cosmos';

/**
 * App-managed sessions for native (username/password) accounts.
 *
 * SWA Free tier has no custom auth providers, so native sign-in issues its
 * own HS256-signed JWT in an HttpOnly cookie. `resolvePrincipal` (auth.ts)
 * falls back to this cookie when SWA's x-ms-client-principal header is
 * absent, so the rest of the API sees the same ClientPrincipal shape.
 */

export const SESSION_COOKIE = 'whisky_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const LOCAL_PROVIDER = 'local';

const ISSUER = 'whisky-app';

function getSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export function isSessionConfigured(): boolean {
  return getSecret() !== null;
}

export interface SessionClaims {
  userId: string;
  username: string;
  // Set after signing in with an admin-issued temporary password. Such a
  // session can only change the password (POST /api/auth/change-password);
  // getSessionPrincipal ignores it, so every other endpoint sees no user.
  mustChangePassword?: boolean;
  // Must match the account's current credentials.sessionVersion. Resetting
  // or changing the password bumps it, which signs out older sessions.
  sessionVersion?: number;
}

export async function createSessionToken(
  claims: SessionClaims,
): Promise<string> {
  const secret = getSecret();
  if (!secret) {
    throw new Error('AUTH_SESSION_SECRET is not configured');
  }
  const payload = {
    name: claims.username,
    sv: claims.sessionVersion ?? 0,
    ...(claims.mustChangePassword && { pwc: true }),
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

/** Returns the session claims, or null for a missing/invalid/expired token. */
export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  const secret = getSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.name !== 'string') {
      return null;
    }
    return {
      userId: payload.sub,
      username: payload.name,
      sessionVersion: typeof payload.sv === 'number' ? payload.sv : 0,
      ...(payload.pwc === true && { mustChangePassword: true }),
    };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): Cookie {
  return {
    name: SESSION_COOKIE,
    value: token,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function clearedSessionCookie(): Cookie {
  return {
    name: SESSION_COOKIE,
    value: '',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 0,
  };
}

export function principalFromClaims(claims: SessionClaims): ClientPrincipal {
  return {
    userId: claims.userId,
    userRoles: ['anonymous', 'authenticated'],
    claims: [{ typ: 'name', val: claims.username }],
    identityProvider: LOCAL_PROVIDER,
    userDetails: claims.username,
  };
}

/**
 * Reads and validates the session cookie, including restricted
 * (must-change-password) sessions. Only the auth endpoints should use this
 * directly. A session is rejected when its account's credentials are gone,
 * now belong to a different user (username re-registered), or have a newer
 * sessionVersion (password reset or changed since it was issued).
 */
export async function readSession(
  request: HttpRequest,
): Promise<SessionClaims | null> {
  const header = request.headers.get('cookie');
  if (!header) return null;

  const token = parseCookies(header)[SESSION_COOKIE];
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const id = claims.username.toLowerCase();
  const { resource: credentials } = await getContainer('credentials')
    .item(id, id)
    .read();
  if (
    !credentials ||
    credentials.userId !== claims.userId ||
    (credentials.sessionVersion ?? 0) !== (claims.sessionVersion ?? 0)
  ) {
    return null;
  }
  return claims;
}

/**
 * Resolves a native-account principal from the session cookie, if any.
 * Restricted sessions that must change their password resolve to null.
 */
export async function getSessionPrincipal(
  request: HttpRequest,
): Promise<ClientPrincipal | null> {
  const claims = await readSession(request);
  if (!claims || claims.mustChangePassword) return null;
  return principalFromClaims(claims);
}
