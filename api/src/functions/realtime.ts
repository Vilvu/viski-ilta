import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { requireAuth } from '../lib/auth';
import { handleError } from '../lib/response';
import { getClientConnectionInfo, getSignalRConfig } from '../lib/realtime';

/**
 * POST /api/negotiate
 * Called automatically by the @microsoft/signalr client before connecting.
 * Returns `{ url, accessToken }` at the top level (not wrapped in `{ data }`),
 * as the SignalR client protocol expects. 503 when SignalR is not configured,
 * in which case the frontend silently falls back to normal fetching.
 */
export async function negotiate(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = await requireAuth(req);
    const config = getSignalRConfig();
    if (!config) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Service Unavailable',
          message: 'Real-time updates are not configured',
          statusCode: 503,
        }),
      };
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getClientConnectionInfo(config, principal.userId)),
    };
  } catch (error) {
    return handleError(error);
  }
}

app.http('negotiate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'negotiate',
  handler: negotiate,
});
