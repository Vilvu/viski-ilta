import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getContainer } from '../lib/cosmos';
import { requireTaster, isAdmin, getClientPrincipal, getUserDisplayName } from '../lib/auth';
import { ok, created, noContent, notFound, handleError } from '../lib/response';
import { v4 as uuidv4 } from 'uuid';

interface WhiskeyDocument {
  id: string;
  eventId: string;
  name: string;
  distillery: string;
  region: string;
  age?: number;
  abv?: number;
  description?: string;
  createdBy: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  averageRating: number;
  ratingCount: number;
}

// GET /api/whiskeys
async function getAllWhiskeys(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // Parse query parameters for pagination
    const topParam = req.query.get('top');
    const skipParam = req.query.get('skip');
    const top = topParam ? Math.min(parseInt(topParam) || 100, 1000) : 100;
    const skip = skipParam ? parseInt(skipParam) || 0 : 0;

    const container = getContainer('whiskeys');
    const querySpec = {
      query: `SELECT c.id, c.name, c.distillery, c.region, c.age, c.abv, c.averageRating, c.ratingCount, c.eventId FROM c ORDER BY c.averageRating DESC OFFSET @skip LIMIT @top`,
      parameters: [
        { name: '@skip', value: skip },
        { name: '@top', value: top }
      ]
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    return ok(resources);
  } catch (error) {
    return handleError(error);
  }
}

// GET /api/events/{eventId}/whiskeys
async function getWhiskeys(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const eventId = req.params.eventId;
    const principal = getClientPrincipal(req);
    const container = getContainer('whiskeys');

    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.eventId = @eventId ORDER BY c.name',
        parameters: [{ name: '@eventId', value: eventId }],
      })
      .fetchAll();

    // If authenticated, attach user's rating to each whiskey
    if (principal) {
      const ratingsContainer = getContainer('ratings');
      const { resources: userRatings } = await ratingsContainer.items
        .query({
          query:
            'SELECT * FROM c WHERE c.eventId = @eventId AND c.userId = @userId',
          parameters: [
            { name: '@eventId', value: eventId },
            { name: '@userId', value: principal.userId },
          ],
        })
        .fetchAll();

      const ratingMap = new Map(
        userRatings.map((r: { whiskeyId: string; score: number }) => [
          r.whiskeyId,
          r.score,
        ]),
      );
      const enriched = resources.map((w: WhiskeyDocument) => ({
        ...w,
        userRating: ratingMap.get(w.id),
      }));
      return ok(enriched);
    }

    return ok(resources);
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/events/{eventId}/whiskeys
async function createWhiskey(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const eventId = req.params.eventId;
    const body = (await req.json()) as Partial<WhiskeyDocument>;

    if (!body.name || !body.distillery || !body.region) {
      return {
        status: 400,
        body: JSON.stringify({
          error: 'name, distillery, and region are required',
        }),
      };
    }

    const now = new Date().toISOString();
    const displayName = await getUserDisplayName(principal);
    const whiskey: WhiskeyDocument = {
      id: uuidv4(),
      eventId,
      name: body.name,
      distillery: body.distillery,
      region: body.region,
      age: body.age,
      abv: body.abv,
      description: body.description,
      createdBy: displayName,
      createdByUserId: principal.userId,
      createdAt: now,
      updatedAt: now,
      averageRating: 0,
      ratingCount: 0,
    };

    const container = getContainer('whiskeys');
    const { resource } = await container.items.create(whiskey);

    // Increment event whiskey count
    const eventsContainer = getContainer('events');
    const { resource: event } = await eventsContainer
      .item(eventId, eventId)
      .read();
    if (event) {
      await eventsContainer
        .item(eventId, eventId)
        .patch([{ op: 'incr', path: '/whiskeyCount', value: 1 }]);
    }

    return created(resource);
  } catch (error) {
    return handleError(error);
  }
}

// GET /api/events/{eventId}/whiskeys/{whiskeyId}
async function getWhiskey(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const { eventId, whiskeyId } = req.params;
    const principal = requireTaster(req);
    const container = getContainer('whiskeys');
    const { resource } = await container.item(whiskeyId, eventId).read();
    if (!resource) return notFound('Whiskey not found');

    const ratingsContainer = getContainer('ratings');
    const { resources } = await ratingsContainer.items
      .query({
        query:
          'SELECT * FROM c WHERE c.whiskeyId = @whiskeyId AND c.userId = @userId',
        parameters: [
          { name: '@whiskeyId', value: whiskeyId },
          { name: '@userId', value: principal.userId },
        ],
      })
      .fetchAll();
    return ok({ ...resource, userRating: resources[0]?.score });
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/events/{eventId}/whiskeys/{whiskeyId}
async function deleteWhiskey(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const { eventId, whiskeyId } = req.params;
    const container = getContainer('whiskeys');
    const { resource } = await container.item(whiskeyId, eventId).read();
    if (!resource) return notFound('Whiskey not found');

    if (!isAdmin(principal) && resource.createdByUserId !== principal.userId) {
      return {
        status: 403,
        body: JSON.stringify({ error: 'Only the creator or admin can delete this whiskey' }),
      };
    }

    await container.item(whiskeyId, eventId).delete();

    // Decrement event whiskey count
    const eventsContainer = getContainer('events');
    const { resource: event } = await eventsContainer
      .item(eventId, eventId)
      .read();
    if (event && event.whiskeyCount > 0) {
      await eventsContainer
        .item(eventId, eventId)
        .patch([{ op: 'incr', path: '/whiskeyCount', value: -1 }]);
    }

    return noContent();
  } catch (error) {
    return handleError(error);
  }
}

// PATCH /api/events/{eventId}/whiskeys/{whiskeyId}
async function updateWhiskey(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const { eventId, whiskeyId } = req.params;
    const container = getContainer('whiskeys');
    const { resource } = await container.item(whiskeyId, eventId).read();
    if (!resource) return notFound('Whiskey not found');

    if (!isAdmin(principal) && resource.createdByUserId !== principal.userId) {
      return {
        status: 403,
        body: JSON.stringify({ error: 'Only the creator or admin can update this whiskey' }),
      };
    }

    const body = (await req.json()) as Partial<WhiskeyDocument>;
    const updated: WhiskeyDocument = {
      ...resource,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    const { resource: updatedResource } = await container.items.upsert(updated);
    return ok(updatedResource);
  } catch (error) {
    return handleError(error);
  }
}

app.http('getWhiskeys', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys',
  handler: getWhiskeys,
});
app.http('createWhiskey', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys',
  handler: createWhiskey,
});
app.http('getWhiskey', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys/{whiskeyId}',
  handler: getWhiskey,
});
app.http('deleteWhiskey', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys/{whiskeyId}',
  handler: deleteWhiskey,
});
app.http('updateWhiskey', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys/{whiskeyId}',
  handler: updateWhiskey,
});

app.http('getAllWhiskeys', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'whiskeys',
  handler: getAllWhiskeys,
});
