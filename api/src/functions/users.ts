import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getContainer } from '../lib/cosmos';
import { requireAuth, UserProfile } from '../lib/auth';
import { ok, created, notFound, badRequest, handleError } from '../lib/response';

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
    const container = getContainer('users');
    const { resource } = await container.item(principal.userId, principal.userId).read();
    
    if (!resource) {
      return notFound('Profile not found');
    }
    
    return ok({ displayName: resource.displayName });
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
    const body = await req.json() as Record<string, unknown>;
    
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
    
    const { resource: existing } = await container.item(principal.userId, principal.userId).read();
    
    let profile: UserProfile;
    if (existing) {
      profile = {
        id: existing.id,
        displayName,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      const { resource: updated } = await container.item(principal.userId, principal.userId).replace(profile);
      return ok({ displayName: updated.displayName });
    } else {
      profile = {
        id: principal.userId,
        displayName,
        createdAt: now,
        updatedAt: now,
      };
      const { resource: newProfile } = await container.items.create(profile);
      return created({ displayName: newProfile.displayName });
    }
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
