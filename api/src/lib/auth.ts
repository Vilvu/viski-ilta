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
  createdAt: string;
  updatedAt: string;
}

/**
 * Ensures a `users` document exists for the authenticated principal.
 * Creates one with role='anonymous' on first sign-in, capturing email and
 * displayName from Entra claims. If an existing doc is missing `email` or
 * `role` (legacy docs), backfills those fields.
 */
export async function ensureUser(
  principal: ClientPrincipal,
): Promise<UserProfile> {
  const container = getContainer('users');
  const { resource } = await container
    .item(principal.userId, principal.userId)
    .read();
  const now = new Date().toISOString();
  const email = getUserEmail(principal);

  if (!resource) {
    const profile: UserProfile = {
      id: principal.userId,
      displayName: getUserName(principal),
      email,
      role: 'anonymous',
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

  if (needsEmailBackfill || needsRoleBackfill) {
    const profile: UserProfile = {
      id: resource.id,
      displayName: resource.displayName,
      email: needsEmailBackfill ? email : resource.email,
      role: needsRoleBackfill ? 'anonymous' : resource.role,
      createdAt: resource.createdAt,
      updatedAt: now,
    };
    const { resource: saved } = await container
      .item(principal.userId, principal.userId)
      .replace(profile);
    return saved as UserProfile;
  }

  return resource as UserProfile;
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
