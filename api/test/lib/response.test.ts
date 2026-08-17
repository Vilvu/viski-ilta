import { describe, it, expect, vi } from 'vitest';
import {
  ok,
  created,
  noContent,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
  handleError,
} from '../../src/lib/response';

function parse(body: string | undefined | null): unknown {
  return body ? JSON.parse(body) : body;
}

describe('response helpers', () => {
  it('ok() returns 200 with a data/message envelope', () => {
    const res = ok({ id: '1' }, 'done');
    expect(res.status).toBe(200);
    expect(res.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(parse(res.body as string)).toEqual({
      data: { id: '1' },
      message: 'done',
    });
  });

  it('ok() omits message when not provided', () => {
    const res = ok({ id: '1' });
    expect(parse(res.body as string)).toEqual({
      data: { id: '1' },
      message: undefined,
    });
  });

  it('created() returns 201 with a data envelope', () => {
    const res = created({ id: '2' });
    expect(res.status).toBe(201);
    expect(parse(res.body as string)).toEqual({ data: { id: '2' } });
  });

  it('noContent() returns 204 with no body', () => {
    const res = noContent();
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
  });

  it('badRequest() returns 400 with error shape', () => {
    const res = badRequest('bad input');
    expect(res.status).toBe(400);
    expect(parse(res.body as string)).toEqual({
      error: 'Bad Request',
      message: 'bad input',
      statusCode: 400,
    });
  });

  it('unauthorized() defaults its message', () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(parse(res.body as string)).toMatchObject({
      error: 'Unauthorized',
      message: 'Authentication required',
      statusCode: 401,
    });
  });

  it('forbidden() defaults its message', () => {
    const res = forbidden();
    expect(res.status).toBe(403);
    expect(parse(res.body as string)).toMatchObject({
      error: 'Forbidden',
      message: 'Forbidden',
      statusCode: 403,
    });
  });

  it('notFound() defaults its message', () => {
    const res = notFound();
    expect(res.status).toBe(404);
    expect(parse(res.body as string)).toMatchObject({
      error: 'Not Found',
      message: 'Not found',
      statusCode: 404,
    });
  });

  it('serverError() defaults its message and never includes internals', () => {
    const res = serverError();
    expect(res.status).toBe(500);
    expect(parse(res.body as string)).toEqual({
      error: 'Internal Server Error',
      message: 'Internal server error',
      statusCode: 500,
    });
  });

  describe('handleError', () => {
    it('maps a { statusCode, message } shaped error to the matching response', () => {
      expect(
        handleError({ statusCode: 401, message: 'need auth' }).status,
      ).toBe(401);
      expect(
        handleError({ statusCode: 403, message: 'no access' }).status,
      ).toBe(403);
      expect(handleError({ statusCode: 404, message: 'missing' }).status).toBe(
        404,
      );
      expect(handleError({ statusCode: 400, message: 'bad' }).status).toBe(400);
    });

    it('preserves the message from a shaped error', () => {
      const res = handleError({ statusCode: 404, message: 'Event not found' });
      expect(parse(res.body as string)).toMatchObject({
        message: 'Event not found',
      });
    });

    it('falls back to 500 for an unrecognized statusCode', () => {
      const res = handleError({ statusCode: 418, message: 'teapot' });
      expect(res.status).toBe(500);
    });

    it('falls back to 500 for a plain Error instance and does not leak the stack', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = handleError(new Error('internal secret detail'));
      expect(res.status).toBe(500);
      expect(res.body as string).not.toContain('internal secret detail');
      expect(parse(res.body as string)).toEqual({
        error: 'Internal Server Error',
        message: 'Internal server error',
        statusCode: 500,
      });
      spy.mockRestore();
    });

    it('falls back to 500 for a string error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = handleError('just a string');
      expect(res.status).toBe(500);
      spy.mockRestore();
    });

    it('falls back to 500 for null', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = handleError(null);
      expect(res.status).toBe(500);
      spy.mockRestore();
    });

    it('falls back to 500 for undefined', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = handleError(undefined);
      expect(res.status).toBe(500);
      spy.mockRestore();
    });
  });
});
