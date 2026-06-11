import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getContainer } from '../lib/cosmos';
import { requireTaster, isAdmin, getUserName } from '../lib/auth';
import { ok, created, noContent, notFound, handleError } from '../lib/response';
import { v4 as uuidv4 } from 'uuid';

interface EventDocument {
  id: string;
  name: string;
  description: string;
  date: string;
  location: string;
  createdBy: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  whiskeyCount: number;
}

// GET /api/events
async function getEvents(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const container = getContainer('events');
    const { resources } = await container.items
      .query('SELECT * FROM c ORDER BY c.date DESC')
      .fetchAll();
    return ok(resources);
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/events
async function createEvent(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const body = (await req.json()) as Partial<EventDocument>;

    if (!body.name || !body.date || !body.location) {
      return {
        status: 400,
        body: JSON.stringify({
          error: 'name, date, and location are required',
        }),
      };
    }

    const now = new Date().toISOString();
    const event: EventDocument = {
      id: uuidv4(),
      name: body.name,
      description: body.description ?? '',
      date: body.date,
      location: body.location,
      createdBy: getUserName(principal),
      createdByUserId: principal.userId,
      createdAt: now,
      updatedAt: now,
      whiskeyCount: 0,
    };

    const container = getContainer('events');
    const { resource } = await container.items.create(event);
    return created(resource);
  } catch (error) {
    return handleError(error);
  }
}

// GET /api/events/{eventId}
async function getEvent(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const eventId = req.params.eventId;
    const container = getContainer('events');
    const { resource } = await container.item(eventId, eventId).read();
    if (!resource) return notFound('Event not found');
    return ok(resource);
  } catch (error) {
    return handleError(error);
  }
}

// PATCH /api/events/{eventId}
async function updateEvent(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const eventId = req.params.eventId;
    const container = getContainer('events');
    const { resource } = await container.item(eventId, eventId).read();
    if (!resource) return notFound('Event not found');

    if (!isAdmin(principal) && resource.createdByUserId !== principal.userId) {
      return {
        status: 403,
        body: JSON.stringify({ error: 'Only the creator or admin can update this event' }),
      };
    }

    const body = (await req.json()) as Partial<EventDocument>;
    const updated: EventDocument = {
      ...resource,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    const { resource: updatedResource } = await container.item(eventId, eventId).replace(updated);
    return ok(updatedResource);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/events/{eventId}
async function deleteEvent(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const principal = requireTaster(req);
    const eventId = req.params.eventId;
    const container = getContainer('events');
    const { resource } = await container.item(eventId, eventId).read();
    if (!resource) return notFound('Event not found');

    if (!isAdmin(principal) && resource.createdByUserId !== principal.userId) {
      return {
        status: 403,
        body: JSON.stringify({ error: 'Only the creator or admin can delete this event' }),
      };
    }

    await container.item(eventId, eventId).delete();
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}

app.http('getEvents', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events',
  handler: getEvents,
});
app.http('createEvent', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'events',
  handler: createEvent,
});
app.http('getEvent', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/{eventId}',
  handler: getEvent,
});
app.http('updateEvent', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'events/{eventId}',
  handler: updateEvent,
});
app.http('deleteEvent', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'events/{eventId}',
  handler: deleteEvent,
});
