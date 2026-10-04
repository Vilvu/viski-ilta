import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getContainer } from '../lib/cosmos';
import {
  generateTemporaryPassword,
  hashPassword,
  TEMP_PASSWORD_TTL_HOURS,
} from '../lib/passwords';
import {
  requireAuth,
  requireAdmin,
  ensureUser,
  AppRole,
  UserProfile,
} from '../lib/auth';
import {
  ok,
  noContent,
  badRequest,
  notFound,
  handleError,
} from '../lib/response';

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
export async function getMe(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = await requireAuth(req);
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
export async function updateMe(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = await requireAuth(req);
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
        { op: 'set', path: '/updatedAt', value: now },
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
export async function listUsers(
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
      authProvider: u.authProvider === 'local' ? 'local' : 'aad',
    }));

    return ok(users);
  } catch (error) {
    return handleError(error);
  }
}

// PUT /api/users/{id}/role (admin-only)
export async function setUserRole(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const { principal } = await requireAdmin(req);
    const { id } = req.params;
    const body = (await req.json()) as { role?: string };

    if (!body.role || !ALLOWED_ROLES.includes(body.role as AppRole)) {
      return badRequest(`role must be one of: ${ALLOWED_ROLES.join(', ')}`);
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
        const options = etag
          ? { accessCondition: { type: 'IfMatch', condition: etag } }
          : {};
        const { resource: saved } = await container
          .item(id, id)
          .replace(updated, options);

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
    return handleError(
      new Error('Failed to update user role due to concurrent modifications'),
    );
  } catch (error: unknown) {
    return handleError(error);
  }
}

// DELETE /api/users/{id} (admin-only)
// Removes the user's profile and, for native accounts, their credentials so
// they can no longer sign in (and the username becomes available again).
// Ratings and whiskeys the user created are deliberately kept. An Entra ID
// user who signs in again is re-provisioned as a new 'anonymous' user.
export async function deleteUser(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const { principal } = await requireAdmin(req);
    const { id } = req.params;

    if (id === principal.userId) {
      return badRequest('You cannot remove your own account');
    }

    const usersContainer = getContainer('users');
    const { resource: target } = await usersContainer.item(id, id).read();
    if (!target) {
      return notFound('User not found');
    }

    // Remove credentials first: if the profile delete then fails, the user
    // still can't sign in and an admin can simply retry the removal.
    const credentialsContainer = getContainer('credentials');
    const { resources: credentials } = await credentialsContainer.items
      .query({
        query: 'SELECT c.id FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: id }],
      })
      .fetchAll();
    for (const { id: credentialsId } of credentials as { id: string }[]) {
      await credentialsContainer.item(credentialsId, credentialsId).delete();
    }

    await usersContainer.item(id, id).delete();
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/users/{id}/reset-password (admin-only)
// Replaces a native account's password with a random temporary one that
// expires after TEMP_PASSWORD_TTL_HOURS and must be changed at next sign-in.
// The temporary password is returned once, in this response only.
export async function resetUserPassword(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const { principal } = await requireAdmin(req);
    const { id } = req.params;

    if (id === principal.userId) {
      return badRequest('Use Change password to change your own password');
    }

    const container = getContainer('credentials');
    const { resources } = await container.items
      .query({
        query: 'SELECT c.id FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: id }],
      })
      .fetchAll();
    const credentialsId = (resources as { id: string }[])[0]?.id;
    if (!credentialsId) {
      // Entra ID users have no password here; their sign-in is Microsoft's.
      return notFound('No username/password account found for this user');
    }

    const temporaryPassword = generateTemporaryPassword();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + TEMP_PASSWORD_TTL_HOURS * 3_600_000,
    ).toISOString();

    await container.item(credentialsId, credentialsId).patch([
      {
        op: 'set',
        path: '/passwordHash',
        value: await hashPassword(temporaryPassword),
      },
      { op: 'set', path: '/mustChangePassword', value: true },
      { op: 'set', path: '/tempPasswordExpiresAt', value: expiresAt },
      // A reset is often the fix for a locked-out user.
      { op: 'set', path: '/failedAttempts', value: 0 },
      { op: 'set', path: '/lockedUntil', value: null },
      { op: 'set', path: '/updatedAt', value: now.toISOString() },
    ]);

    const response = ok({ temporaryPassword, expiresAt });
    return {
      ...response,
      headers: { ...response.headers, 'Cache-Control': 'no-store' },
    };
  } catch (error) {
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

app.http('deleteUser', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'users/{id}',
  handler: deleteUser,
});

app.http('resetUserPassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'users/{id}/reset-password',
  handler: resetUserPassword,
});
