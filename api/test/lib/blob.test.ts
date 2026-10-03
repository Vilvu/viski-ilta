import { describe, it, expect, afterEach } from 'vitest';
import {
  getBlobStore,
  createMemoryBlobStore,
  resetBlobStoreForTests,
} from '../../src/lib/blob';

afterEach(() => {
  delete process.env.USE_BLOB_MOCK;
  delete process.env.BLOB_STORAGE_CONNECTION_STRING;
  resetBlobStoreForTests();
});

describe('createMemoryBlobStore', () => {
  it('round-trips, copies buffers and deletes', async () => {
    const store = createMemoryBlobStore();
    const data = Buffer.from([1, 2, 3]);
    await store.upload('a/b.jpg', data, 'image/jpeg');
    data[0] = 9; // mutating the caller's buffer must not change the stored blob

    expect(await store.download('a/b.jpg')).toEqual(Buffer.from([1, 2, 3]));
    await store.delete('a/b.jpg');
    expect(await store.download('a/b.jpg')).toBeNull();
    // Deleting a missing blob is a no-op.
    await expect(store.delete('a/b.jpg')).resolves.toBeUndefined();
  });
});

describe('getBlobStore', () => {
  it('uses the in-memory store when USE_BLOB_MOCK=true and memoizes it', async () => {
    process.env.USE_BLOB_MOCK = 'true';
    const store = getBlobStore();
    await store.upload('x', Buffer.from([1]), 'image/png');
    expect(getBlobStore()).toBe(store);
    expect(await getBlobStore().download('x')).toEqual(Buffer.from([1]));
  });

  it('throws a clear error when no connection string is configured', () => {
    expect(() => getBlobStore()).toThrow(/BLOB_STORAGE_CONNECTION_STRING/);
  });

  it('creates an Azure-backed store from a connection string', () => {
    process.env.BLOB_STORAGE_CONNECTION_STRING =
      'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net';
    const store = getBlobStore();
    expect(typeof store.upload).toBe('function');
  });
});
