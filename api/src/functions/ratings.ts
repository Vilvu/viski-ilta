import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getContainer } from '../lib/cosmos';
import { requireTaster, getUserDisplayName } from '../lib/auth';
import { ok, noContent, notFound, handleError } from '../lib/response';
import { v4 as uuidv4 } from 'uuid';

interface RatingDocument {
  id: string;
  whiskeyId: string;
  eventId: string;
  userId: string;
  userName: string;
  score: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// GET /api/whiskeys/{whiskeyId}/ratings
async function getRatings(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    requireTaster(req);
    const whiskeyId = req.params.whiskeyId;
    const container = getContainer('ratings');
    const { resources } = await container.items
      .query({
        query:
          'SELECT * FROM c WHERE c.whiskeyId = @whiskeyId ORDER BY c.createdAt DESC',
        parameters: [{ name: '@whiskeyId', value: whiskeyId }],
      })
      .fetchAll();
    return ok(resources);
  } catch (error) {
    return handleError(error);
  }
}

// PUT /api/whiskeys/{whiskeyId}/ratings/me
async function upsertMyRating(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const whiskeyId = req.params.whiskeyId;
    const body = (await req.json()) as {
      eventId: string;
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

    // Check for existing rating
    const { resources: existing } = await ratingsContainer.items
      .query({
        query:
          'SELECT * FROM c WHERE c.whiskeyId = @whiskeyId AND c.userId = @userId',
        parameters: [
          { name: '@whiskeyId', value: whiskeyId },
          { name: '@userId', value: principal.userId },
        ],
      })
      .fetchAll();

    let rating: RatingDocument;
    if (existing.length > 0) {
      // Update existing
      const existingRating = existing[0] as RatingDocument;
      const displayName = await getUserDisplayName(principal);
      rating = {
        ...existingRating,
        userName: displayName,
        score: body.score,
        notes: body.notes,
        updatedAt: now,
      };
      await ratingsContainer.item(existingRating.id, whiskeyId).replace(rating);
    } else {
      // Create new
      const displayName = await getUserDisplayName(principal);
      rating = {
        id: uuidv4(),
        whiskeyId,
        eventId: body.eventId,
        userId: principal.userId,
        userName: displayName,
        score: body.score,
        notes: body.notes,
        createdAt: now,
        updatedAt: now,
      };
      await ratingsContainer.items.create(rating);
    }

    // Recalculate average on whiskey document
    const { resources: allRatings } = await ratingsContainer.items
      .query({
        query: 'SELECT c.score FROM c WHERE c.whiskeyId = @whiskeyId',
        parameters: [{ name: '@whiskeyId', value: whiskeyId }],
      })
      .fetchAll();

    const scores = allRatings.map((r: { score: number }) => r.score);
    const average =
      scores.reduce((a: number, b: number) => a + b, 0) / scores.length;

    const whiskeysContainer = getContainer('whiskeys');
    const { resource: whiskey } = await whiskeysContainer
      .item(whiskeyId, body.eventId)
      .read();
    if (whiskey) {
      await whiskeysContainer.item(whiskeyId, body.eventId).patch([
        {
          op: 'set',
          path: '/averageRating',
          value: Math.round(average * 10) / 10,
        },
        { op: 'set', path: '/ratingCount', value: scores.length },
      ]);
    }

    return ok(rating);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/whiskeys/{whiskeyId}/ratings/me
async function deleteMyRating(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const whiskeyId = req.params.whiskeyId;

    const ratingsContainer = getContainer('ratings');
    const { resources: existing } = await ratingsContainer.items
      .query({
        query:
          'SELECT * FROM c WHERE c.whiskeyId = @whiskeyId AND c.userId = @userId',
        parameters: [
          { name: '@whiskeyId', value: whiskeyId },
          { name: '@userId', value: principal.userId },
        ],
      })
      .fetchAll();

    if (existing.length === 0) return notFound('Rating not found');

    const existingRating = existing[0] as RatingDocument;
    await ratingsContainer.item(existingRating.id, whiskeyId).delete();

    // Recalculate average
    const { resources: allRatings } = await ratingsContainer.items
      .query({
        query: 'SELECT c.score FROM c WHERE c.whiskeyId = @whiskeyId',
        parameters: [{ name: '@whiskeyId', value: whiskeyId }],
      })
      .fetchAll();

    const scores = allRatings.map((r: { score: number }) => r.score);
    const average =
      scores.length > 0
        ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
        : 0;

    const whiskeysContainer = getContainer('whiskeys');
    const { resource: whiskey } = await whiskeysContainer
      .item(whiskeyId, existingRating.eventId)
      .read();
    if (whiskey) {
      await whiskeysContainer.item(whiskeyId, existingRating.eventId).patch([
        {
          op: 'set',
          path: '/averageRating',
          value: Math.round(average * 10) / 10,
        },
        { op: 'set', path: '/ratingCount', value: scores.length },
      ]);
    }

    return noContent();
  } catch (error) {
    return handleError(error);
  }
}

app.http('getRatings', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'whiskeys/{whiskeyId}/ratings',
  handler: getRatings,
});
app.http('upsertMyRating', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'whiskeys/{whiskeyId}/ratings/me',
  handler: upsertMyRating,
});
app.http('deleteMyRating', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'whiskeys/{whiskeyId}/ratings/me',
  handler: deleteMyRating,
});
