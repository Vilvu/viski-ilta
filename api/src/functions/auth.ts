import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getContainer } from '../lib/cosmos';
import { UserProfile } from '../lib/auth';
import {
  clearedSessionCookie,
  createSessionToken,
  isSessionConfigured,
  principalFromClaims,
  readSession,
  sessionCookie,
} from '../lib/session';
import {
  BCRYPT_ROUNDS,
  hashPassword,
  validatePassword,
} from '../lib/passwords';
import {
  ok,
  created,
  badRequest,
  unauthorized,
  serverError,
  handleError,
} from '../lib/response';

/**
 * Native username/password accounts. Credentials live in the `credentials`
 * container keyed by the lowercased username (so a Cosmos 409 on create
 * enforces case-insensitive uniqueness atomically); the profile lives in
 * `users` exactly like an Entra ID user, with role 'anonymous' until an
 * admin promotes it.
 */

export interface Credentials {
  id: string; // lowercased username
  username: string; // as typed at registration
  userId: string; // 'local:<uuid>', the users doc id
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: string | null;
  // Set when an admin resets the password: the current password is a
  // temporary one that expires at tempPasswordExpiresAt and must be
  // replaced on the next sign-in.
  mustChangePassword?: boolean;
  tempPasswordExpiresAt?: string | null;
  // Embedded in session tokens; bumped to sign out existing sessions.
  sessionVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
const INVALID_CREDENTIALS = 'Invalid username or password';
const TEMP_PASSWORD_EXPIRED =
  'Temporary password has expired. Ask an admin to reset it again.';

// Compared against when the username doesn't exist, so a login attempt for
// an unknown user takes as long as one for a real user.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

function validateUsername(username: unknown): string | null {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    return 'Username must be 3-32 characters: letters, numbers, ".", "_" or "-"';
  }
  return null;
}

function tooManyAttempts(): HttpResponseInit {
  return {
    status: 429,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Too Many Requests',
      message: 'Too many failed sign-in attempts. Try again later.',
      statusCode: 429,
    }),
  };
}

function conflict(message: string): HttpResponseInit {
  return {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Conflict', message, statusCode: 409 }),
  };
}

function profileResponse(profile: UserProfile) {
  return {
    displayName: profile.displayName,
    email: profile.email,
    role: profile.role,
    usernameConfirmed: profile.usernameConfirmed,
  };
}

async function readBody(
  req: HttpRequest,
): Promise<{ username?: unknown; password?: unknown }> {
  try {
    return ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isLocked(credentials: Credentials, now: Date): boolean {
  return !!credentials.lockedUntil && new Date(credentials.lockedUntil) > now;
}

function isTempPasswordExpired(credentials: Credentials, now: Date): boolean {
  return (
    credentials.mustChangePassword === true &&
    (!credentials.tempPasswordExpiresAt ||
      new Date(credentials.tempPasswordExpiresAt) <= now)
  );
}

// Bounds the optimistic-concurrency retries in reserveAttempt. Losing this
// many races in a row means a burst of parallel guesses; refuse rather than
// spin.
const MAX_RESERVE_RETRIES = 5;

type AttemptReservation =
  | { kind: 'missing' }
  | { kind: 'locked' }
  | { kind: 'reserved'; credentials: Credentials; lockedNow: boolean };

/**
 * Counts a password check against the lockout limit BEFORE bcrypt runs
 * (sign-in and change-password share one counter). The write is
 * conditional on the etag that was read, so parallel requests can't all
 * read the same counter and each get a "free" guess: every check is
 * serialized through the counter, and once it reaches MAX_FAILED_ATTEMPTS
 * the account is locked and further checks are refused unseen. A correct
 * password resets the counter (see resetFailedAttempts).
 *
 * `expectedUserId` guards change-password against a username that was
 * re-registered to another account since the session was issued.
 */
async function reserveAttempt(
  id: string,
  now: Date,
  expectedUserId?: string,
): Promise<AttemptReservation> {
  const item = getContainer('credentials').item(id, id);
  for (let retry = 0; retry < MAX_RESERVE_RETRIES; retry++) {
    const { resource, etag } = await item.read();
    const credentials = resource as Credentials | undefined;
    if (
      !credentials ||
      (expectedUserId && credentials.userId !== expectedUserId)
    ) {
      return { kind: 'missing' };
    }
    if (isLocked(credentials, now)) {
      return { kind: 'locked' };
    }

    // An expired lock starts a fresh window.
    const previous = credentials.lockedUntil ? 0 : credentials.failedAttempts;
    const failedAttempts = (previous ?? 0) + 1;
    const lockedNow = failedAttempts >= MAX_FAILED_ATTEMPTS;
    const options = etag
      ? { accessCondition: { type: 'IfMatch', condition: etag } }
      : {};
    try {
      const { resource: updated } = await item.patch(
        [
          { op: 'set', path: '/failedAttempts', value: failedAttempts },
          {
            op: 'set',
            path: '/lockedUntil',
            value: lockedNow
              ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000).toISOString()
              : null,
          },
          { op: 'set', path: '/updatedAt', value: now.toISOString() },
        ],
        options,
      );
      return {
        kind: 'reserved',
        credentials: (updated ?? credentials) as Credentials,
        lockedNow,
      };
    } catch (error) {
      if ((error as { code?: number })?.code === 412) continue;
      throw error;
    }
  }
  return { kind: 'locked' };
}

/** Clears the counter claimed by reserveAttempt after a correct password. */
async function resetFailedAttempts(id: string, now: Date): Promise<void> {
  await getContainer('credentials')
    .item(id, id)
    .patch([
      { op: 'set', path: '/failedAttempts', value: 0 },
      { op: 'set', path: '/lockedUntil', value: null },
      { op: 'set', path: '/updatedAt', value: now.toISOString() },
    ]);
}

// POST /api/auth/register
export async function register(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    if (!isSessionConfigured()) {
      return serverError('Native sign-in is not configured');
    }

    const { username, password } = await readBody(req);
    const usernameError = validateUsername(username);
    if (usernameError) return badRequest(usernameError);
    const passwordError = validatePassword(password);
    if (passwordError) return badRequest(passwordError);

    const name = username as string;
    const now = new Date().toISOString();
    const userId = `local:${uuidv4()}`;
    const credentials: Credentials = {
      id: name.toLowerCase(),
      username: name,
      userId,
      passwordHash: await hashPassword(password as string),
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
    };

    const credentialsContainer = getContainer('credentials');
    try {
      await credentialsContainer.items.create(credentials);
    } catch (error) {
      if ((error as { code?: number })?.code === 409) {
        return conflict('Username is already taken');
      }
      throw error;
    }

    const profile: UserProfile = {
      id: userId,
      displayName: name,
      email: '',
      role: 'anonymous',
      usernameConfirmed: true,
      authProvider: 'local',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await getContainer('users').items.create(profile);
    } catch (error) {
      // Roll back so the username isn't left reserved without a profile.
      await credentialsContainer
        .item(credentials.id, credentials.id)
        .delete()
        .catch(() => undefined);
      throw error;
    }

    const token = await createSessionToken({ userId, username: name });
    return {
      ...created(profileResponse(profile)),
      cookies: [sessionCookie(token)],
    };
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/auth/login
export async function login(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    if (!isSessionConfigured()) {
      return serverError('Native sign-in is not configured');
    }

    const { username, password } = await readBody(req);
    if (typeof username !== 'string' || typeof password !== 'string') {
      return badRequest('username and password are required');
    }

    const id = username.toLowerCase();
    const now = new Date();
    const reservation = await reserveAttempt(id, now);
    if (reservation.kind === 'missing') {
      await bcrypt.compare(password, DUMMY_HASH);
      return unauthorized(INVALID_CREDENTIALS);
    }
    if (reservation.kind === 'locked') {
      return tooManyAttempts();
    }

    const { credentials, lockedNow } = reservation;
    const valid = await bcrypt.compare(password, credentials.passwordHash);
    if (!valid) {
      return lockedNow ? tooManyAttempts() : unauthorized(INVALID_CREDENTIALS);
    }

    await resetFailedAttempts(id, now);

    if (isTempPasswordExpired(credentials, now)) {
      return unauthorized(TEMP_PASSWORD_EXPIRED);
    }

    const { resource: profile } = await getContainer('users')
      .item(credentials.userId, credentials.userId)
      .read();
    if (!profile) {
      return unauthorized(INVALID_CREDENTIALS);
    }

    const mustChangePassword = credentials.mustChangePassword === true;
    const token = await createSessionToken({
      userId: credentials.userId,
      username: credentials.username,
      mustChangePassword,
      sessionVersion: credentials.sessionVersion ?? 0,
    });
    return {
      ...ok({
        ...profileResponse(profile as UserProfile),
        mustChangePassword,
      }),
      cookies: [sessionCookie(token)],
    };
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/auth/logout
// Clearing the cookie isn't enough on its own: a copied token would stay
// valid until it expires. Bumping sessionVersion revokes it server-side —
// along with the account's sessions on other devices.
export async function logout(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const session = await readSession(req);
    if (session) {
      const id = session.username.toLowerCase();
      await getContainer('credentials')
        .item(id, id)
        .patch([
          { op: 'incr', path: '/sessionVersion', value: 1 },
          { op: 'set', path: '/updatedAt', value: new Date().toISOString() },
        ]);
    }
  } catch (error) {
    // Still clear the cookie; the browser should end up signed out.
    console.error('logout: failed to revoke session', error);
  }
  return { status: 204, cookies: [clearedSessionCookie()] };
}

// GET /api/auth/me — mirrors SWA's /.auth/me shape for native sessions.
export async function getSession(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const session = await readSession(req);
    let clientPrincipal = session ? principalFromClaims(session) : null;
    let cookies;
    if (clientPrincipal) {
      // The session outlives the account if an admin removed the user:
      // report it as signed out and clear the cookie.
      const { resource: profile } = await getContainer('users')
        .item(clientPrincipal.userId, clientPrincipal.userId)
        .read();
      if (!profile) {
        clientPrincipal = null;
        cookies = [clearedSessionCookie()];
      }
    }
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        clientPrincipal,
        mustChangePassword: clientPrincipal
          ? session?.mustChangePassword === true
          : false,
      }),
      cookies,
    };
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/auth/change-password
// Works for any native session, including the restricted one issued after
// signing in with a temporary password. Issues a fresh, unrestricted session.
export async function changePassword(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const session = await readSession(req);
    if (!session) {
      return { ...unauthorized(), cookies: [clearedSessionCookie()] };
    }

    let body: { currentPassword?: unknown; newPassword?: unknown } = {};
    try {
      body = ((await req.json()) ?? {}) as typeof body;
    } catch {
      // fall through to validation
    }
    const { currentPassword, newPassword } = body;
    if (typeof currentPassword !== 'string') {
      return badRequest('currentPassword is required');
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) return badRequest(passwordError);
    if (newPassword === currentPassword) {
      return badRequest('New password must be different from the current one');
    }

    const id = session.username.toLowerCase();
    const container = getContainer('credentials');
    // Same protections as sign-in: a session cookie must not allow unlimited
    // guesses at the current password, or use of an expired temporary one.
    const now = new Date();
    // readSession already checked the account; it may have changed since.
    const reservation = await reserveAttempt(id, now, session.userId);
    if (reservation.kind === 'missing') {
      return { ...unauthorized(), cookies: [clearedSessionCookie()] };
    }
    if (reservation.kind === 'locked') {
      return tooManyAttempts();
    }

    const { credentials, lockedNow } = reservation;
    if (!(await bcrypt.compare(currentPassword, credentials.passwordHash))) {
      return lockedNow
        ? tooManyAttempts()
        : badRequest('Current password is incorrect');
    }
    if (isTempPasswordExpired(credentials, now)) {
      await resetFailedAttempts(id, now);
      return {
        ...unauthorized(TEMP_PASSWORD_EXPIRED),
        cookies: [clearedSessionCookie()],
      };
    }

    const sessionVersion = (credentials.sessionVersion ?? 0) + 1;
    await container.item(id, id).patch([
      {
        op: 'set',
        path: '/passwordHash',
        value: await hashPassword(newPassword as string),
      },
      { op: 'set', path: '/mustChangePassword', value: false },
      { op: 'set', path: '/tempPasswordExpiresAt', value: null },
      { op: 'set', path: '/failedAttempts', value: 0 },
      { op: 'set', path: '/lockedUntil', value: null },
      // Signs out every other session (e.g. other devices).
      { op: 'set', path: '/sessionVersion', value: sessionVersion },
      { op: 'set', path: '/updatedAt', value: now.toISOString() },
    ]);

    const token = await createSessionToken({
      userId: credentials.userId,
      username: credentials.username,
      sessionVersion,
    });
    return { status: 204, cookies: [sessionCookie(token)] };
  } catch (error) {
    return handleError(error);
  }
}

app.http('authRegister', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/register',
  handler: register,
});

app.http('authLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: login,
});

app.http('authLogout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: logout,
});

app.http('authSession', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: getSession,
});

app.http('authChangePassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/change-password',
  handler: changePassword,
});
