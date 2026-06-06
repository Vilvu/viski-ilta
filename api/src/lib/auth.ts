import { HttpRequest } from '@azure/functions';

export interface ClientPrincipal {
  userId: string;
  userRoles: string[];
  claims: Array<{ typ: string; val: string }>;
  identityProvider: string;
  userDetails: string;
}

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

export function requireAdmin(request: HttpRequest): ClientPrincipal {
  const principal = requireAuth(request);
  if (!principal.userRoles.includes('admin')) {
    throw { statusCode: 403, message: 'Admin role required' };
  }
  return principal;
}

export function getUserName(principal: ClientPrincipal): string {
  const nameClaim = (principal.claims ?? []).find((c) => c.typ === 'name');
  return nameClaim?.val ?? principal.userDetails;
}
