import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeCosmos } from '../helpers/mockCosmos';
import { fakeBlob } from '../helpers/mockBlob';
import {
  makeRequest,
  makeContext,
  makePrincipal,
  readJson,
} from '../helpers/request';

vi.mock('../../src/lib/cosmos', () => ({
  getContainer: (name: string) => fakeCosmos.getContainer(name),
}));

vi.mock('../../src/lib/blob', () => ({
  getBlobStore: () => fakeBlob,
}));

const aiMock = vi.hoisted(() => ({
  isAiRecognitionEnabled: vi.fn(() => true),
  recognizeWhiskey: vi.fn(),
}));
vi.mock('../../src/lib/ai', () => aiMock);

import {
  uploadWhiskeyImage,
  deleteWhiskeyImage,
  getWhiskeyImage,
  recognizeWhiskeyImage,
  deleteCatalogWhiskey,
  getAllWhiskeys,
  getEventWhiskeys,
  MAX_IMAGE_BYTES,
} from '../../src/functions/whiskeys';

const TASTER_ID = 'taster1';
const OTHER_TASTER_ID = 'taster2';
const ADMIN_ID = 'admin1';
const ANON_ID = 'anon1';
const WHISKEY_ID = 'w1';
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function user(id: string, role: string) {
  return {
    id,
    displayName: id,
    email: `${id}@example.com`,
    role,
    usernameConfirmed: true,
    createdAt: '',
    updatedAt: '',
  };
}

function seedWhiskey(overrides: Record<string, unknown> = {}) {
  fakeCosmos.seed('whiskeys', [
    {
      id: WHISKEY_ID,
      name: 'Lagavulin 16',
      createdBy: 'Taster',
      createdByUserId: TASTER_ID,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      globalAverageRating: 0,
      globalRatingCount: 0,
      ...overrides,
    },
  ]);
}

async function readWhiskeyDoc() {
  const { resource } = await fakeCosmos
    .getContainer('whiskeys')
    .item(WHISKEY_ID, WHISKEY_ID)
    .read();
  return resource as Record<string, unknown>;
}

function uploadRequest(
  userId: string | null,
  options: {
    contentType?: string;
    body?: Uint8Array;
    contentLength?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    'content-type': options.contentType ?? 'image/jpeg',
  };
  if (options.contentLength) headers['content-length'] = options.contentLength;
  return makeRequest({
    principal: userId ? makePrincipal({ userId }) : null,
    params: { whiskeyId: WHISKEY_ID },
    headers,
    rawBody: options.body ?? JPEG_BYTES,
  });
}

beforeEach(() => {
  fakeCosmos.reset();
  fakeBlob.reset();
  aiMock.isAiRecognitionEnabled.mockReset().mockReturnValue(true);
  aiMock.recognizeWhiskey.mockReset();
  fakeCosmos.seed('users', [
    user(TASTER_ID, 'taster'),
    user(OTHER_TASTER_ID, 'taster'),
    user(ADMIN_ID, 'admin'),
    user(ANON_ID, 'anonymous'),
  ]);
});

describe('uploadWhiskeyImage (PUT /whiskeys/{id}/image)', () => {
  it('requires authentication', async () => {
    seedWhiskey();
    const res = await uploadWhiskeyImage(uploadRequest(null), makeContext());
    expect(res.status).toBe(401);
  });

  it('forbids a taster who did not create the whiskey', async () => {
    seedWhiskey();
    const res = await uploadWhiskeyImage(
      uploadRequest(OTHER_TASTER_ID),
      makeContext(),
    );
    expect(res.status).toBe(403);
    expect(fakeBlob.blobs.size).toBe(0);
  });

  it('returns 404 for an unknown whiskey', async () => {
    const res = await uploadWhiskeyImage(
      uploadRequest(TASTER_ID),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('rejects unsupported content types', async () => {
    seedWhiskey();
    const res = await uploadWhiskeyImage(
      uploadRequest(TASTER_ID, { contentType: 'image/gif' }),
      makeContext(),
    );
    expect(res.status).toBe(400);
  });

  it('rejects an empty body', async () => {
    seedWhiskey();
    const res = await uploadWhiskeyImage(
      uploadRequest(TASTER_ID, { body: new Uint8Array() }),
      makeContext(),
    );
    expect(res.status).toBe(400);
  });

  it('rejects images over the size limit (declared or actual)', async () => {
    seedWhiskey();
    const declared = await uploadWhiskeyImage(
      uploadRequest(TASTER_ID, {
        contentLength: String(MAX_IMAGE_BYTES + 1),
      }),
      makeContext(),
    );
    expect(declared.status).toBe(413);

    const actual = await uploadWhiskeyImage(
      uploadRequest(TASTER_ID, { body: new Uint8Array(MAX_IMAGE_BYTES + 1) }),
      makeContext(),
    );
    expect(actual.status).toBe(413);
    expect(fakeBlob.blobs.size).toBe(0);
  });

  it('stores the photo and sets the image fields (content-type params ignored)', async () => {
    seedWhiskey();
    const res = await uploadWhiskeyImage(
      uploadRequest(TASTER_ID, { contentType: 'image/jpeg; charset=binary' }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    const body = (data as { data: Record<string, unknown> }).data;
    expect(body.imageUpdatedAt).toEqual(expect.any(String));
    expect(body.imageContentType).toBe('image/jpeg');

    const doc = await readWhiskeyDoc();
    const blobName = doc.imageBlobName as string;
    expect(blobName).toMatch(/^w1\/.+\.jpg$/);
    expect(fakeBlob.blobs.get(blobName)?.data).toEqual(Buffer.from(JPEG_BYTES));
  });

  it('replaces an existing photo and deletes the old blob', async () => {
    seedWhiskey({
      imageBlobName: 'w1/old.jpg',
      imageContentType: 'image/jpeg',
      imageUpdatedAt: '2026-01-01T00:00:00Z',
    });
    await fakeBlob.upload('w1/old.jpg', Buffer.from([1]), 'image/jpeg');

    const res = await uploadWhiskeyImage(
      uploadRequest(ADMIN_ID, { contentType: 'image/png' }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const doc = await readWhiskeyDoc();
    expect(doc.imageBlobName).toMatch(/\.png$/);
    expect(doc.imageBlobName).not.toBe('w1/old.jpg');
    expect(fakeBlob.blobs.has('w1/old.jpg')).toBe(false);
    expect(fakeBlob.blobs.size).toBe(1);
  });

  it('succeeds even if deleting the previous blob fails', async () => {
    seedWhiskey({ imageBlobName: 'w1/old.jpg' });
    const spy = vi
      .spyOn(fakeBlob, 'delete')
      .mockRejectedValueOnce(new Error('storage down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await uploadWhiskeyImage(
      uploadRequest(TASTER_ID),
      makeContext(),
    );
    expect(res.status).toBe(200);
    spy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('deleteWhiskeyImage (DELETE /whiskeys/{id}/image)', () => {
  it('removes the blob and clears the image fields', async () => {
    seedWhiskey({
      imageBlobName: 'w1/a.jpg',
      imageContentType: 'image/jpeg',
      imageUpdatedAt: '2026-01-01T00:00:00Z',
    });
    await fakeBlob.upload('w1/a.jpg', Buffer.from([1]), 'image/jpeg');

    const res = await deleteWhiskeyImage(
      makeRequest({
        principal: makePrincipal({ userId: TASTER_ID }),
        params: { whiskeyId: WHISKEY_ID },
      }),
      makeContext(),
    );
    expect(res.status).toBe(204);
    expect(fakeBlob.blobs.size).toBe(0);
    const doc = await readWhiskeyDoc();
    expect(doc.imageBlobName).toBeUndefined();
    expect(doc.imageUpdatedAt).toBeUndefined();
    expect(doc.imageContentType).toBeUndefined();
  });

  it('returns 404 when the whiskey has no photo', async () => {
    seedWhiskey();
    const res = await deleteWhiskeyImage(
      makeRequest({
        principal: makePrincipal({ userId: TASTER_ID }),
        params: { whiskeyId: WHISKEY_ID },
      }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('forbids non-creators', async () => {
    seedWhiskey({ imageBlobName: 'w1/a.jpg' });
    const res = await deleteWhiskeyImage(
      makeRequest({
        principal: makePrincipal({ userId: OTHER_TASTER_ID }),
        params: { whiskeyId: WHISKEY_ID },
      }),
      makeContext(),
    );
    expect(res.status).toBe(403);
  });
});

describe('getWhiskeyImage (GET /whiskeys/{id}/image)', () => {
  it('returns 404 when the whiskey does not exist', async () => {
    const res = await getWhiskeyImage(
      makeRequest({ params: { whiskeyId: 'missing' } }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the whiskey has no photo', async () => {
    seedWhiskey();
    const res = await getWhiskeyImage(
      makeRequest({ params: { whiskeyId: WHISKEY_ID } }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the blob is missing from storage', async () => {
    seedWhiskey({ imageBlobName: 'w1/gone.jpg' });
    const res = await getWhiskeyImage(
      makeRequest({ params: { whiskeyId: WHISKEY_ID } }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('serves the bytes anonymously with type and immutable caching', async () => {
    seedWhiskey({
      imageBlobName: 'w1/a.webp',
      imageContentType: 'image/webp',
      imageUpdatedAt: '2026-01-01T00:00:00Z',
    });
    await fakeBlob.upload('w1/a.webp', Buffer.from([9, 8, 7]), 'image/webp');

    const res = await getWhiskeyImage(
      makeRequest({ params: { whiskeyId: WHISKEY_ID } }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    expect(res.body).toEqual(Buffer.from([9, 8, 7]));
  });
});

describe('image fields in list responses and cascade delete', () => {
  it('getAllWhiskeys projects imageUpdatedAt', async () => {
    seedWhiskey({ imageUpdatedAt: '2026-02-02T00:00:00Z' });
    const res = await getAllWhiskeys(makeRequest(), makeContext());
    const list = (readJson(res).data as { data: Record<string, unknown>[] })
      .data;
    expect(list[0].imageUpdatedAt).toBe('2026-02-02T00:00:00Z');
    expect(list[0].imageBlobName).toBeUndefined();
  });

  it('getEventWhiskeys includes imageUpdatedAt', async () => {
    seedWhiskey({ imageUpdatedAt: '2026-02-02T00:00:00Z' });
    fakeCosmos.seed('eventWhiskeys', [
      {
        id: 'link1',
        eventId: 'e1',
        whiskeyId: WHISKEY_ID,
        addedBy: 'Taster',
        addedByUserId: TASTER_ID,
        createdAt: '',
        averageRating: 0,
        ratingCount: 0,
      },
    ]);
    const res = await getEventWhiskeys(
      makeRequest({ params: { eventId: 'e1' } }),
      makeContext(),
    );
    const list = (readJson(res).data as { data: Record<string, unknown>[] })
      .data;
    expect(list[0].imageUpdatedAt).toBe('2026-02-02T00:00:00Z');
  });

  it('deleteCatalogWhiskey also deletes the photo blob', async () => {
    seedWhiskey({ imageBlobName: 'w1/a.jpg' });
    await fakeBlob.upload('w1/a.jpg', Buffer.from([1]), 'image/jpeg');
    const res = await deleteCatalogWhiskey(
      makeRequest({
        principal: makePrincipal({ userId: TASTER_ID }),
        params: { whiskeyId: WHISKEY_ID },
      }),
      makeContext(),
    );
    expect(res.status).toBe(204);
    expect(fakeBlob.blobs.size).toBe(0);
  });
});

describe('recognizeWhiskeyImage (POST /whiskeys/recognize)', () => {
  function recognizeRequest(
    userId: string | null,
    query: Record<string, string> = {},
    contentType = 'image/jpeg',
  ) {
    return makeRequest({
      principal: userId ? makePrincipal({ userId }) : null,
      headers: { 'content-type': contentType },
      query,
      rawBody: JPEG_BYTES,
    });
  }

  it('requires authentication', async () => {
    const res = await recognizeWhiskeyImage(
      recognizeRequest(null),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it('requires the taster role', async () => {
    const res = await recognizeWhiskeyImage(
      recognizeRequest(ANON_ID),
      makeContext(),
    );
    expect(res.status).toBe(403);
  });

  it('returns 503 when AI recognition is not configured', async () => {
    aiMock.isAiRecognitionEnabled.mockReturnValue(false);
    const res = await recognizeWhiskeyImage(
      recognizeRequest(TASTER_ID),
      makeContext(),
    );
    expect(res.status).toBe(503);
    expect(aiMock.recognizeWhiskey).not.toHaveBeenCalled();
  });

  it('validates the image', async () => {
    const res = await recognizeWhiskeyImage(
      recognizeRequest(TASTER_ID, {}, 'text/plain'),
      makeContext(),
    );
    expect(res.status).toBe(400);
  });

  it('returns the recognition result and passes language and media type', async () => {
    const result = {
      name: 'Lagavulin 16',
      distillery: 'Lagavulin',
      region: 'Islay',
      age: 16,
      abv: 43,
      description: 'Savuinen',
      sources: [],
    };
    aiMock.recognizeWhiskey.mockResolvedValue(result);

    const res = await recognizeWhiskeyImage(
      recognizeRequest(TASTER_ID, { lang: 'fi' }),
      makeContext(),
    );
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { data: unknown }).data).toEqual(result);
    expect(aiMock.recognizeWhiskey).toHaveBeenCalledWith(
      Buffer.from(JPEG_BYTES),
      'image/jpeg',
      'fi',
    );
  });

  it('defaults to English for unknown languages', async () => {
    aiMock.recognizeWhiskey.mockResolvedValue({ sources: [] });
    await recognizeWhiskeyImage(
      recognizeRequest(TASTER_ID, { lang: 'sv' }),
      makeContext(),
    );
    expect(aiMock.recognizeWhiskey).toHaveBeenCalledWith(
      expect.any(Buffer),
      'image/jpeg',
      'en',
    );
  });

  it.each([
    [429, 'busy'],
    [502, 'failed'],
    [503, 'not configured'],
  ])('maps recognition error %s to the response status', async (code, msg) => {
    aiMock.recognizeWhiskey.mockRejectedValue({
      statusCode: code,
      message: msg,
    });
    const res = await recognizeWhiskeyImage(
      recognizeRequest(TASTER_ID),
      makeContext(),
    );
    expect(res.status).toBe(code);
  });
});
