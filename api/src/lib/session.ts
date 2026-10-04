import type { Cookie, HttpRequest } from '@azure/functions';
import { parse as parseCookies } from 'cookie';
import { SignJWT, jwtVerify } from 'jose';
import type { ClientPrincipal } from './auth';

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
}

export async function createSessionToken(
  claims: SessionClaims,
): Promise<string> {
  const secret = getSecret();
  if (!secret) {
    throw new Error('AUTH_SESSION_SECRET is not configured');
  }
  return new SignJWT({ name: claims.username })
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
    return { userId: payload.sub, username: payload.name };
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

/** Resolves a native-account principal from the session cookie, if any. */
export async function getSessionPrincipal(
  request: HttpRequest,
): Promise<ClientPrincipal | null> {
  const header = request.headers.get('cookie');
  if (!header) return null;

  const token = parseCookies(header)[SESSION_COOKIE];
  if (!token) return null;

  const claims = await verifySessionToken(token);
  return claims ? principalFromClaims(claims) : null;
}
