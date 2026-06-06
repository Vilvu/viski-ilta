import { HttpResponseInit } from '@azure/functions';

export function ok<T>(data: T, message?: string): HttpResponseInit {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, message }),
  };
}

export function created<T>(data: T): HttpResponseInit {
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  };
}

export function noContent(): HttpResponseInit {
  return { status: 204 };
}

export function badRequest(message: string): HttpResponseInit {
  return {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Bad Request', message, statusCode: 400 }),
  };
}

export function unauthorized(
  message = 'Authentication required',
): HttpResponseInit {
  return {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Unauthorized', message, statusCode: 401 }),
  };
}

export function forbidden(message = 'Forbidden'): HttpResponseInit {
  return {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Forbidden', message, statusCode: 403 }),
  };
}

export function notFound(message = 'Not found'): HttpResponseInit {
  return {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Not Found', message, statusCode: 404 }),
  };
}

export function serverError(
  message = 'Internal server error',
): HttpResponseInit {
  return {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Internal Server Error',
      message,
      statusCode: 500,
    }),
  };
}

export function handleError(error: unknown): HttpResponseInit {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const e = error as { statusCode: number; message: string };
    if (e.statusCode === 401) return unauthorized(e.message);
    if (e.statusCode === 403) return forbidden(e.message);
    if (e.statusCode === 404) return notFound(e.message);
    if (e.statusCode === 400) return badRequest(e.message);
  }

  console.error('Unhandled error:', error);
  return serverError();
}
