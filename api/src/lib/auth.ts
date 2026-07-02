import { HttpRequest } from '@azure/functions';
import { getContainer } from './cosmos';

export interface ClientPrincipal {
  userId: string;
  userRoles: string[];
  claims: Array<{ typ: string; val: string }>;
  identityProvider: string;
  userDetails: string;
}

export type AppRole = 'anonymous' | 'taster' | 'admin';

export function getClientPrincipal(
  request: HttpRequest,
): ClientPrincipal | null {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded) as ClientPrincipal;
  } catch {
    return null;
  }
}

export function requireAuth(request: HttpRequest): ClientPrincipal {
  const principal = getClientPrincipal(request);
  if (!principal) {
    throw { statusCode: 401, message: 'Authentication required' };
  }
  return principal;
}

export function getUserName(principal: ClientPrincipal): string {
  const nameClaim = (principal.claims ?? []).find((c) => c.typ === 'name');
  return nameClaim?.val ?? principal.userDetails;
}

/**
 * Extracts the user's email address from Entra ID claims.
 * Priority: preferred_username -> upn -> emails -> email -> userDetails.
 */
export function getUserEmail(principal: ClientPrincipal): string {
  const claims = principal.claims ?? [];
  const priority = ['preferred_username', 'upn', 'emails', 'email'];

  for (const typ of priority) {
    const claim = claims.find((c) => c.typ === typ && c.val);
    if (claim?.val) return claim.val;
  }

  return principal.userDetails;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  role: AppRole;
  // False until the user explicitly saves a display name via PUT /users/me.
  // Auto-provisioned docs (first sign-in) start out unconfirmed so the
  // frontend knows to prompt for a display name. Docs predating this field
  // are backfilled to `false` too (see backfill below) — this may briefly
  // re-prompt already-confirmed legacy users, but the modal pre-fills their
  // existing displayName so re-confirming is a harmless no-op for them,
  // whereas defaulting to `true` would permanently silence the prompt for
  // users auto-provisioned during the window before this field existed.
  usernameConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ensures a `users` document exists for the authenticated principal.
 * Creates one with role='anonymous' on first sign-in, capturing email and
 * displayName from Entra claims. If an existing doc is missing `email`,
 * `role`, or `usernameConfirmed` (legacy docs), backfills those fields.
 */
export async function ensureUser(
  principal: ClientPrincipal,
): Promise<UserProfile> {
  const container = getContainer('users');
  const now = new Date().toISOString();
  const email = getUserEmail(principal);

  const MAX_RETRIES = 5;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    const { resource, etag } = await container
      .item(principal.userId, principal.userId)
      .read();

    if (!resource) {
      const profile: UserProfile = {
        id: principal.userId,
        displayName: getUserName(principal),
        email,
        role: 'anonymous',
        usernameConfirmed: false,
        createdAt: now,
        updatedAt: now,
      };

      try {
        const { resource: created } = await container.items.create(profile);
        return created as UserProfile;
      } catch (error: any) {
        // Handle Cosmos 409 conflict - another request created the user concurrently
        // Re-read the existing document
        if (error.code === 409) {
          const { resource: existing } = await container
            .item(principal.userId, principal.userId)
            .read();
          if (existing) {
            return existing as UserProfile;
          }
        }
        // For other errors, re-throw
        throw error;
      }
    }

    const needsEmailBackfill = !resource.email;
    const needsRoleBackfill = !resource.role;
    // Legacy docs predate this field entirely (undefined). Backfill to
    // `false` rather than `true`: docs auto-provisioned during the window
    // before this field existed never had a confirmed username either, so
    // defaulting to `true` would permanently hide the setup prompt from
    // those users. Re-prompting genuinely legacy (already-named) users is a
    // harmless no-op since the modal pre-fills their existing displayName.
    const needsConfirmedBackfill = resource.usernameConfirmed === undefined;

    if (!needsEmailBackfill && !needsRoleBackfill && !needsConfirmedBackfill) {
      return resource as UserProfile;
    }

    const profile: UserProfile = {
      id: resource.id,
      displayName: resource.displayName,
      email: needsEmailBackfill ? email : resource.email,
      role: needsRoleBackfill ? 'anonymous' : resource.role,
      usernameConfirmed: needsConfirmedBackfill
        ? false
        : resource.usernameConfirmed,
      createdAt: resource.createdAt,
      updatedAt: now,
    };

    try {
      // Optimistic concurrency: only write if the doc hasn't changed since
      // we read it, so this lazy backfill can't clobber a concurrent
      // setUserRole (or another backfill) update. On conflict, retry.
      const options = etag ? { accessCondition: { type: 'IfMatch', condition: etag } } : {};
      const { resource: saved } = await container
        .item(principal.userId, principal.userId)
        .replace(profile, options);
      return saved as UserProfile;
    } catch (error: any) {
      if (
        error.code === 412 ||
        (error.message && error.message.includes('Precondition Failed'))
      ) {
        retryCount++;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 50),
        );
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to ensure user document due to concurrent modifications');
}

/**
 * Returns the persisted app role for the principal, defaulting to
 * 'anonymous'. This is the single source of truth for authorization
 * (SWA `userRoles` is no longer used for taster/admin).
 */
export async function getUserRole(
  principal: ClientPrincipal,
): Promise<AppRole> {
  const profile = await ensureUser(principal);
  return profile.role;
}

export async function requireAdmin(
  request: HttpRequest,
): Promise<{ principal: ClientPrincipal; profile: UserProfile }> {
  const principal = requireAuth(request);
  const profile = await ensureUser(principal);
  if (profile.role !== 'admin') {
    throw { statusCode: 403, message: 'Admin role required' };
  }
  return { principal, profile };
}

export async function requireTaster(
  request: HttpRequest,
): Promise<{ principal: ClientPrincipal; profile: UserProfile }> {
  const principal = requireAuth(request);
  const profile = await ensureUser(principal);
  if (profile.role !== 'taster' && profile.role !== 'admin') {
    throw { statusCode: 403, message: 'Taster role required' };
  }
  return { principal, profile };
}

export async function isAdmin(principal: ClientPrincipal): Promise<boolean> {
  return (await getUserRole(principal)) === 'admin';
}

export async function getUserDisplayName(
  principal: ClientPrincipal,
): Promise<string> {
  try {
    const profile = await ensureUser(principal);
    return profile.displayName;
  } catch {
    // Profile not found or error reading, fall back to OAuth name
  }
  return getUserName(principal);
}

// Overload that accepts a profile directly to avoid redundant calls
export function getUserDisplayNameFromProfile(profile: UserProfile): string {
  return profile.displayName;
}
