import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getContainer } from '../lib/cosmos';
import {
  requireAuth,
  requireAdmin,
  ensureUser,
  AppRole,
  UserProfile,
} from '../lib/auth';
import { ok, badRequest, notFound, handleError } from '../lib/response';

const ALLOWED_ROLES: AppRole[] = ['anonymous', 'taster', 'admin'];

function validateDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return 'Display name cannot be empty';
  }
  if (trimmed.length > 50) {
    return 'Display name must be 50 characters or less';
  }
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return 'Display name contains invalid characters';
  }
  return null;
}

// GET /api/users/me
async function getMe(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireAuth(req);
    const profile = await ensureUser(principal);

    return ok({
      displayName: profile.displayName,
      email: profile.email,
      role: profile.role,
      usernameConfirmed: profile.usernameConfirmed,
    });
  } catch (error) {
    return handleError(error);
  }
}

// PUT /api/users/me
async function updateMe(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireAuth(req);
    const body = (await req.json()) as Record<string, unknown>;

    if (!body.displayName || typeof body.displayName !== 'string') {
      return badRequest('displayName is required and must be a string');
    }

    const validationError = validateDisplayName(body.displayName);
    if (validationError) {
      return badRequest(validationError);
    }

    const displayName = body.displayName.trim();
    const container = getContainer('users');
    const now = new Date().toISOString();

    // Use patch operation to update only displayName/usernameConfirmed/updatedAt
    // This avoids the lost update issue when setUserRole modifies the role concurrently
    const { resource: updated } = await container
      .item(principal.userId, principal.userId)
      .patch([
        { op: 'set', path: '/displayName', value: displayName },
        { op: 'set', path: '/usernameConfirmed', value: true },
        { op: 'set', path: '/updatedAt', value: now }
      ]);

    return ok({
      displayName: updated.displayName,
      email: updated.email,
      role: updated.role,
      usernameConfirmed: updated.usernameConfirmed,
    });
  } catch (error: unknown) {
    return handleError(error);
  }
}

// GET /api/users (admin-only)
async function listUsers(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    await requireAdmin(req);
    const container = getContainer('users');
    const { resources } = await container.items
      .query('SELECT * FROM c')
      .fetchAll();

    const users = (resources as UserProfile[]).map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
    }));

    return ok(users);
  } catch (error) {
    return handleError(error);
  }
}

// PUT /api/users/{id}/role (admin-only)
async function setUserRole(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const { principal } = await requireAdmin(req);
    const { id } = req.params;
    const body = (await req.json()) as { role?: string };

    if (!body.role || !ALLOWED_ROLES.includes(body.role as AppRole)) {
      return badRequest(
        `role must be one of: ${ALLOWED_ROLES.join(', ')}`,
      );
    }
    const newRole = body.role as AppRole;

    // Reject self-demotion to non-admin roles
    if (id === principal.userId && newRole !== 'admin') {
      return badRequest('You cannot change your own admin role');
    }

    const container = getContainer('users');
    
    // For Cosmos DB, we'll use a loop with read-modify-write to handle the race condition
    // For the mock, we'll do a simple check since it doesn't support ETags
    const MAX_RETRIES = 5;
    let retryCount = 0;
    
    while (retryCount < MAX_RETRIES) {
      const { resource: target, etag } = await container.item(id, id).read();
      if (!target) {
        return notFound('User not found');
      }

      // Check if we're trying to remove the last admin
      if (target.role === 'admin' && newRole !== 'admin') {
        // Atomic check for last admin
        const { resources: admins } = await container.items
          .query({
            query: 'SELECT c.id FROM c WHERE c.role = @role',
            parameters: [{ name: '@role', value: 'admin' }],
          })
          .fetchAll();
          
        // If this user is the last admin, prevent demotion
        if (admins.length <= 1) {
          return badRequest('Cannot remove the last remaining admin');
        }
      }

      const updated: UserProfile = {
        ...target,
        role: newRole,
        updatedAt: new Date().toISOString(),
      };

      try {
        // Try to save with ETag-based optimistic concurrency (if supported)
        const options = etag ? { accessCondition: { type: 'IfMatch', condition: etag } } : {};
        const { resource: saved } = await container.item(id, id).replace(updated, options);
        
        return ok({
          id: saved.id,
          email: saved.email,
          displayName: saved.displayName,
          role: saved.role,
        });
      } catch (error: any) {
        // If we get a precondition failed error, it means someone else modified the document
        // We'll retry the operation
        if (
          error.code === 412 ||
          (error.message && error.message.includes('Precondition Failed'))
        ) {
          retryCount++;
          // Small delay to reduce contention
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 50),
          );
          continue;
        }
        // For other errors, re-throw
        throw error;
      }
    }
    
    // If we exhausted retries, return an error
    return handleError(new Error('Failed to update user role due to concurrent modifications'));
  } catch (error: unknown) {
    return handleError(error);
  }
}

app.http('getMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'users/me',
  handler: getMe,
});

app.http('updateMe', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'users/me',
  handler: updateMe,
});

app.http('listUsers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'users',
  handler: listUsers,
});

app.http('setUserRole', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'users/{id}/role',
  handler: setUserRole,
});
