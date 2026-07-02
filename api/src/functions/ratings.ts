import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getContainer } from '../lib/cosmos';
import { requireTaster } from '../lib/auth';
import { ok, noContent, notFound, handleError } from '../lib/response';
import {
  recomputeEventAggregate,
  recomputeGlobalAggregate,
} from '../lib/aggregates';
import { v4 as uuidv4 } from 'uuid';

interface RatingDocument {
  id: string;
  eventId: string;
  whiskeyId: string;
  userId: string;
  userName: string;
  score: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/events/{eventId}/whiskeys/{whiskeyId}/ratings
 * List all ratings for a whiskey in a specific event.
 */
async function getRatings(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    await requireTaster(req);
    const { eventId, whiskeyId } = req.params;
    const container = getContainer('ratings');

    const { resources } = await container.items
      .query({
        query:
          'SELECT * FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId ORDER BY c.createdAt DESC',
        parameters: [
          { name: '@eventId', value: eventId },
          { name: '@whiskeyId', value: whiskeyId },
        ],
      })
      .fetchAll();

    return ok(resources);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /api/events/{eventId}/whiskeys/{whiskeyId}/ratings/me
 * Upsert the authenticated user's rating for a whiskey in an event.
 * Uniqueness is (eventId, whiskeyId, userId).
 * Recomputes both event-scoped and global aggregates after write.
 */
async function upsertMyRating(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const { principal, profile } = await requireTaster(req);
    const { eventId, whiskeyId } = req.params;
    const body = (await req.json()) as {
      score: number;
      notes?: string;
    };

    if (!body.score || body.score < 1 || body.score > 10) {
      return {
        status: 400,
        body: JSON.stringify({ error: 'score must be between 1 and 10' }),
      };
    }

    const ratingsContainer = getContainer('ratings');
    const now = new Date().toISOString();

    // Check for existing rating with this (eventId, whiskeyId, userId)
    const { resources: existing } = await ratingsContainer.items
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

    let rating: RatingDocument;
    if (existing.length > 0) {
      // Update existing rating
      const existingRating = existing[0] as RatingDocument;
      rating = {
        ...existingRating,
        userName: profile.displayName,
        score: body.score,
        notes: body.notes,
        updatedAt: now,
      };
      await ratingsContainer.item(existingRating.id, eventId).replace(rating);
    } else {
      // Create new rating
      rating = {
        id: uuidv4(),
        eventId,
        whiskeyId,
        userId: principal.userId,
        userName: profile.displayName,
        score: body.score,
        notes: body.notes,
        createdAt: now,
        updatedAt: now,
      };
      await ratingsContainer.items.create(rating);
    }

    // Recompute event-scoped and global aggregates
    await recomputeEventAggregate(eventId, whiskeyId);
    await recomputeGlobalAggregate(whiskeyId);

    return ok(rating);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/events/{eventId}/whiskeys/{whiskeyId}/ratings/me
 * Delete the authenticated user's rating for a whiskey in an event.
 * Recomputes both event-scoped and global aggregates after deletion.
 */
async function deleteMyRating(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const { principal } = await requireTaster(req);
    const { eventId, whiskeyId } = req.params;

    const ratingsContainer = getContainer('ratings');

    // Find the existing rating for this (eventId, whiskeyId, userId)
    const { resources: existing } = await ratingsContainer.items
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

    if (existing.length === 0) {
      return notFound('Rating not found');
    }

    const existingRating = existing[0] as RatingDocument;
    await ratingsContainer.item(existingRating.id, eventId).delete();

    // Recompute event-scoped and global aggregates
    await recomputeEventAggregate(eventId, whiskeyId);
    await recomputeGlobalAggregate(whiskeyId);

    return noContent();
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/whiskeys/{whiskeyId}/ratings
 * List all ratings for a catalog whiskey across all events.
 */
async function getWhiskeyRatingsGlobally(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    await requireTaster(req);
    const { whiskeyId } = req.params;
    const container = getContainer('ratings');

    const { resources } = await container.items
      .query(
        {
          query:
            'SELECT TOP 100 c.id, c.whiskeyId, c.score, c.notes, c.userName, c.createdAt, c.userId FROM c WHERE c.whiskeyId = @whiskeyId ORDER BY c.createdAt DESC',
          parameters: [{ name: '@whiskeyId', value: whiskeyId }],
        },
        { enableCrossPartitionQuery: true }
      )
      .fetchAll();

    return ok(resources);
  } catch (error) {
    return handleError(error);
  }
}

// Route registrations
app.http('getWhiskeyRatingsGlobally', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'whiskeys/{whiskeyId}/ratings',
  handler: getWhiskeyRatingsGlobally,
});

app.http('getRatings', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys/{whiskeyId}/ratings',
  handler: getRatings,
});

app.http('upsertMyRating', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys/{whiskeyId}/ratings/me',
  handler: upsertMyRating,
});

app.http('deleteMyRating', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'events/{eventId}/whiskeys/{whiskeyId}/ratings/me',
  handler: deleteMyRating,
});
