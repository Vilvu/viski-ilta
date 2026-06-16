import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getContainer } from '../lib/cosmos';
import {
  requireTaster,
  isAdmin,
  getClientPrincipal,
  getUserDisplayName,
} from '../lib/auth';
import { ok, created, noContent, notFound, handleError } from '../lib/response';
import { recomputeGlobalAggregate } from '../lib/aggregates';
import { v4 as uuidv4 } from 'uuid';

// Catalog whiskey document (partition key: /id)
interface WhiskeyDocument {
  id: string;
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
  globalAverageRating: number;
  globalRatingCount: number;
}

// Event ↔ whiskey link document (partition key: /eventId)
interface EventWhiskeyDocument {
  id: string;
  eventId: string;
  whiskeyId: string;
  addedBy: string;
  addedByUserId: string;
  createdAt: string;
  averageRating: number;
  ratingCount: number;
}

// Joined response shape (combines link + whiskey + user rating)
interface JoinedWhiskey {
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
  userRating?: number;
}

/**
 * Shared helper: build and insert a new catalog WhiskeyDocument.
 * Extracted to avoid duplicating this logic between createCatalogWhiskey
 * and the create+link branch of addWhiskeyToEvent.
 */
async function insertCatalogWhiskey(
  body: {
    name: string;
    distillery: string;
    region: string;
    age?: number;
    abv?: number;
    description?: string;
  },
  displayName: string,
  userId: string,
): Promise<WhiskeyDocument> {
  const now = new Date().toISOString();
  const whiskey: WhiskeyDocument = {
    id: uuidv4(),
    name: body.name,
    distillery: body.distillery,
    region: body.region,
    age: body.age,
    abv: body.abv,
    description: body.description,
    createdBy: displayName,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
    globalAverageRating: 0,
    globalRatingCount: 0,
  };

  const container = getContainer('whiskeys');
  const { resource } = await container.items.create(whiskey);
  return resource as WhiskeyDocument;
}

/**
 * GET /api/whiskeys
 * List all catalog whiskeys ordered by global average rating.
 * Includes global aggregates; no event context.
 */
async function getAllWhiskeys(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const topParam = req.query.get('top');
    const skipParam = req.query.get('skip');
    const top = topParam ? Math.min(parseInt(topParam) || 100, 1000) : 100;
    const skip = skipParam ? parseInt(skipParam) || 0 : 0;

    const container = getContainer('whiskeys');
    const querySpec = {
      query: `SELECT c.id, c.name, c.distillery, c.region, c.age, c.abv, c.globalAverageRating, c.globalRatingCount FROM c ORDER BY c.globalAverageRating DESC OFFSET @skip LIMIT @top`,
      parameters: [
        { name: '@skip', value: skip },
        { name: '@top', value: top },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    return ok(resources);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/whiskeys
 * Create a new catalog whiskey (standalone, not linked to any event yet).
 */
async function createCatalogWhiskey(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const body = (await req.json()) as Partial<WhiskeyDocument>;

    if (!body.name || !body.distillery || !body.region) {
      return {
        status: 400,
        body: JSON.stringify({
          error: 'name, distillery, and region are required',
        }),
      };
    }

    const displayName = await getUserDisplayName(principal);
    const whiskey = await insertCatalogWhiskey(
      { name: body.name, distillery: body.distillery, region: body.region, age: body.age, abv: body.abv, description: body.description },
      displayName,
      principal.userId,
    );

    return created(whiskey);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/whiskeys/{whiskeyId}
 * Retrieve a single catalog whiskey.
 */
async function getCatalogWhiskey(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const { whiskeyId } = req.params;
    const container = getContainer('whiskeys');
    const { resource } = await container.item(whiskeyId, whiskeyId).read();

    if (!resource) return notFound('Whiskey not found');

    return ok(resource);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/whiskeys/{whiskeyId}
 * Update an existing catalog whiskey.
 * Requires creator-or-admin authorization.
 */
async function updateCatalogWhiskey(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const { whiskeyId } = req.params;
    const container = getContainer('whiskeys');
    const { resource } = await container.item(whiskeyId, whiskeyId).read();

    if (!resource) return notFound('Whiskey not found');

    // Creator-or-admin guard
    if (!isAdmin(principal) && resource.createdByUserId !== principal.userId) {
      return {
        status: 403,
        body: JSON.stringify({
          error: 'Only the creator or admin can update this whiskey',
        }),
      };
    }

    const body = (await req.json()) as Partial<WhiskeyDocument>;
    // Only allow editing of these fields; aggregates cannot be overwritten by client
    const updated: WhiskeyDocument = {
      ...resource,
      name: body.name !== undefined ? body.name : resource.name,
      distillery:
        body.distillery !== undefined ? body.distillery : resource.distillery,
      region: body.region !== undefined ? body.region : resource.region,
      age: body.age !== undefined ? body.age : resource.age,
      abv: body.abv !== undefined ? body.abv : resource.abv,
      description:
        body.description !== undefined ? body.description : resource.description,
      updatedAt: new Date().toISOString(),
      // Preserve aggregates
      globalAverageRating: resource.globalAverageRating,
      globalRatingCount: resource.globalRatingCount,
    };

    const { resource: updatedResource } = await container.items.upsert(updated);
    return ok(updatedResource);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/whiskeys/{whiskeyId}
 * Delete a catalog whiskey.
 * Requires creator-or-admin authorization.
 * Blocks deletion if whiskey is linked to any event (returns 409).
 */
async function deleteCatalogWhiskey(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const { whiskeyId } = req.params;
    const container = getContainer('whiskeys');
    const { resource } = await container.item(whiskeyId, whiskeyId).read();

    if (!resource) return notFound('Whiskey not found');

    // Creator-or-admin guard
    if (!isAdmin(principal) && resource.createdByUserId !== principal.userId) {
      return {
        status: 403,
        body: JSON.stringify({
          error: 'Only the creator or admin can delete this whiskey',
        }),
      };
    }

    // Check if whiskey is linked to any event.
    // eventWhiskeys is partitioned by /eventId, so filtering only on whiskeyId
    // requires a cross-partition fan-out query.
    const eventWhiskeysContainer = getContainer('eventWhiskeys');
    const { resources: links } = await eventWhiskeysContainer.items
      .query(
        {
          query: 'SELECT c.id FROM c WHERE c.whiskeyId = @whiskeyId',
          parameters: [{ name: '@whiskeyId', value: whiskeyId }],
        },
        { enableCrossPartitionQuery: true },
      )
      .fetchAll();

    if (links.length > 0) {
      return {
        status: 409,
        body: JSON.stringify({
          error: `Whiskey is linked to ${links.length} event(s); remove all links before deletion`,
        }),
      };
    }

    await container.item(whiskeyId, whiskeyId).delete();

    return noContent();
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/events/{eventId}/whiskeys
 * List all whiskeys linked to an event with event-scoped aggregates.
 * If authenticated, includes user's rating for each whiskey.
 */
async function getEventWhiskeys(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const { eventId } = req.params;
    const principal = getClientPrincipal(req);
    const eventWhiskeysContainer = getContainer('eventWhiskeys');
    const whiskeysContainer = getContainer('whiskeys');

    // Query all links for this event
    const { resources: links } = await eventWhiskeysContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.eventId = @eventId ORDER BY c.whiskeyId',
        parameters: [{ name: '@eventId', value: eventId }],
      })
      .fetchAll();

    // Fetch all catalog whiskeys in parallel (avoids N sequential round-trips)
    const whiskeyReads = await Promise.all(
      links.map((link: any) => whiskeysContainer.item(link.whiskeyId, link.whiskeyId).read()),
    );

    const joined: JoinedWhiskey[] = [];
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const whiskey = whiskeyReads[i].resource;
      if (whiskey) {
        joined.push({
          id: whiskey.id,
          eventId,
          name: whiskey.name,
          distillery: whiskey.distillery,
          region: whiskey.region,
          age: whiskey.age,
          abv: whiskey.abv,
          description: whiskey.description,
          createdBy: whiskey.createdBy,
          createdByUserId: whiskey.createdByUserId,
          createdAt: whiskey.createdAt,
          updatedAt: whiskey.updatedAt,
          averageRating: link.averageRating, // event-scoped
          ratingCount: link.ratingCount,
        });
      }
    }

    // Attach user's ratings if authenticated
    if (principal) {
      const ratingsContainer = getContainer('ratings');
      const { resources: userRatings } = await ratingsContainer.items
        .query({
          query:
            'SELECT c.whiskeyId, c.score FROM c WHERE c.eventId = @eventId AND c.userId = @userId',
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

      joined.forEach((w) => {
        const rating = ratingMap.get(w.id);
        if (rating !== undefined && rating !== null && typeof rating === 'number') {
          w.userRating = rating;
        }
      });
    }

    // Sort by name
    joined.sort((a, b) => a.name.localeCompare(b.name));

    return ok(joined);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/events/{eventId}/whiskeys
 * Add a whiskey to an event.
 * Supports two modes:
 * - Link existing: body { whiskeyId }
 * - Create + link: body { name, distillery, region, ... } (creates catalog whiskey first)
 */
async function addWhiskeyToEvent(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const { eventId } = req.params;
    const body = (await req.json()) as Partial<WhiskeyDocument> & {
      whiskeyId?: string;
    };

    // Resolve display name once — used for both catalog whiskey createdBy and link addedBy
    const displayName = await getUserDisplayName(principal);

    let whiskeyId: string = body.whiskeyId || '';

    // If no whiskeyId, create a new catalog whiskey using the shared helper
    if (!whiskeyId) {
      if (!body.name || !body.distillery || !body.region) {
        return {
          status: 400,
          body: JSON.stringify({
            error: 'name, distillery, and region are required',
          }),
        };
      }

      const newWhiskey = await insertCatalogWhiskey(
        { name: body.name, distillery: body.distillery, region: body.region, age: body.age, abv: body.abv, description: body.description },
        displayName,
        principal.userId,
      );
      whiskeyId = newWhiskey.id;
    }

    // Check if catalog whiskey exists
    const whiskeysContainer = getContainer('whiskeys');
    const { resource: catalogWhiskey } = await whiskeysContainer
      .item(whiskeyId, whiskeyId)
      .read();
    if (!catalogWhiskey) {
      return notFound(`Whiskey ${whiskeyId} not found`);
    }

    // Check if link already exists
    const eventWhiskeysContainer = getContainer('eventWhiskeys');
    const { resources: existingLinks } = await eventWhiskeysContainer.items
      .query({
        query:
          'SELECT c.id FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId',
        parameters: [
          { name: '@eventId', value: eventId },
          { name: '@whiskeyId', value: whiskeyId },
        ],
      })
      .fetchAll();

    if (existingLinks.length > 0) {
      return {
        status: 409,
        body: JSON.stringify({
          error: 'Whiskey is already linked to this event',
        }),
      };
    }

    // Create the link
    const now = new Date().toISOString();
    const link: EventWhiskeyDocument = {
      id: uuidv4(),
      eventId,
      whiskeyId,
      addedBy: displayName,
      addedByUserId: principal.userId,
      createdAt: now,
      averageRating: 0,
      ratingCount: 0,
    };

    await eventWhiskeysContainer.items.create(link);

    // Increment event whiskeyCount
    const eventsContainer = getContainer('events');
    await eventsContainer
      .item(eventId, eventId)
      .patch([{ op: 'incr', path: '/whiskeyCount', value: 1 }]);

    // Return joined response
    const joinedResponse: JoinedWhiskey = {
      id: catalogWhiskey.id,
      eventId,
      name: catalogWhiskey.name,
      distillery: catalogWhiskey.distillery,
      region: catalogWhiskey.region,
      age: catalogWhiskey.age,
      abv: catalogWhiskey.abv,
      description: catalogWhiskey.description,
      createdBy: catalogWhiskey.createdBy,
      createdByUserId: catalogWhiskey.createdByUserId,
      createdAt: catalogWhiskey.createdAt,
      updatedAt: catalogWhiskey.updatedAt,
      averageRating: 0,
      ratingCount: 0,
    };

    return created(joinedResponse);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/events/{eventId}/whiskeys/{whiskeyId}
 * Retrieve a single whiskey as it appears in an event (with event-scoped aggregates).
 */
async function getEventWhiskey(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const { eventId, whiskeyId } = req.params;

    // Read the link
    const eventWhiskeysContainer = getContainer('eventWhiskeys');
    const { resources: links } = await eventWhiskeysContainer.items
      .query({
        query:
          'SELECT * FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId',
        parameters: [
          { name: '@eventId', value: eventId },
          { name: '@whiskeyId', value: whiskeyId },
        ],
      })
      .fetchAll();

    if (links.length === 0) return notFound('Whiskey not found in this event');

    const link = links[0];

    // Read the catalog whiskey
    const whiskeysContainer = getContainer('whiskeys');
    const { resource: whiskey } = await whiskeysContainer
      .item(whiskeyId, whiskeyId)
      .read();

    if (!whiskey) return notFound('Whiskey catalog entry not found');

    // Build joined response
    const joined: JoinedWhiskey = {
      id: whiskey.id,
      eventId,
      name: whiskey.name,
      distillery: whiskey.distillery,
      region: whiskey.region,
      age: whiskey.age,
      abv: whiskey.abv,
      description: whiskey.description,
      createdBy: whiskey.createdBy,
      createdByUserId: whiskey.createdByUserId,
      createdAt: whiskey.createdAt,
      updatedAt: whiskey.updatedAt,
      averageRating: link.averageRating,
      ratingCount: link.ratingCount,
    };

    // Attach user's rating if authenticated
    if (principal) {
      const ratingsContainer = getContainer('ratings');
      const { resources: userRatings } = await ratingsContainer.items
        .query({
          query:
            'SELECT * FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId AND c.userId = @userId',
          parameters: [
            { name: '@eventId', value: eventId },
            { name: '@whiskeyId', value: whiskeyId },
            { name: '@userId', value: principal.userId },
          ],
        })
        .fetchAll();

      if (userRatings.length > 0) {
        joined.userRating = userRatings[0].score;
      }
    }

    return ok(joined);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/events/{eventId}/whiskeys/{whiskeyId}
 * Remove a whiskey from an event.
 * Requires link creator-or-admin authorization.
 * Deletes associated ratings and recomputes aggregates.
 */
async function removeWhiskeyFromEvent(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const { eventId, whiskeyId } = req.params;

    // Find and read the link
    const eventWhiskeysContainer = getContainer('eventWhiskeys');
    const { resources: links } = await eventWhiskeysContainer.items
      .query({
        query:
          'SELECT * FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId',
        parameters: [
          { name: '@eventId', value: eventId },
          { name: '@whiskeyId', value: whiskeyId },
        ],
      })
      .fetchAll();

    if (links.length === 0) {
      return notFound('Whiskey not found in this event');
    }

    const link = links[0];

    // Link creator-or-admin guard (using addedByUserId as the guard)
    if (!isAdmin(principal) && link.addedByUserId !== principal.userId) {
      return {
        status: 403,
        body: JSON.stringify({
          error: 'Only the user who added this whiskey or admin can remove it',
        }),
      };
    }

    // Delete the link
    await eventWhiskeysContainer.item(link.id, eventId).delete();

    // Delete all ratings for this (eventId, whiskeyId)
    const ratingsContainer = getContainer('ratings');
    const { resources: ratingsToDelete } = await ratingsContainer.items
      .query({
        query:
          'SELECT c.id FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId',
        parameters: [
          { name: '@eventId', value: eventId },
          { name: '@whiskeyId', value: whiskeyId },
        ],
      })
      .fetchAll();

    for (const rating of ratingsToDelete) {
      await ratingsContainer.item(rating.id, eventId).delete();
    }

    // Decrement event whiskeyCount
    const eventsContainer = getContainer('events');
    const { resource: event } = await eventsContainer
      .item(eventId, eventId)
      .read();
    if (event && event.whiskeyCount > 0) {
      await eventsContainer
        .item(eventId, eventId)
        .patch([{ op: 'incr', path: '/whiskeyCount', value: -1 }]);
    }

    // Recompute global aggregate (since ratings for this whiskey were deleted)
    await recomputeGlobalAggregate(whiskeyId);

    return noContent();
  } catch (error) {
    return handleError(error);
  }
}

// Route registrations
app.http('getAllWhiskeys', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'whiskeys',
  handler: getAllWhiskeys,
});

app.http('createCatalogWhiskey', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiskeys',
  handler: createCatalogWhiskey,
});

app.http('getCatalogWhiskey', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'whiskeys/{whiskeyId}',
  handler: getCatalogWhiskey,
});

app.http('updateCatalogWhiskey', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'whiskeys/{whiskeyId}',
  handler: updateCatalogWhiskey,
});

app.http('deleteCatalogWhiskey', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'whiskeys/{whiskeyId}',
  handler: deleteCatalogWhiskey,
});

app.http('getEventWhiskeys', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys',
  handler: getEventWhiskeys,
});

app.http('addWhiskeyToEvent', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys',
  handler: addWhiskeyToEvent,
});

app.http('getEventWhiskey', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys/{whiskeyId}',
  handler: getEventWhiskey,
});

app.http('removeWhiskeyFromEvent', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys/{whiskeyId}',
  handler: removeWhiskeyFromEvent,
});
