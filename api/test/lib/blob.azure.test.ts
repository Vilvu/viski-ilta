import { describe, it, expect, beforeEach, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  const blockBlob = {
    uploadData: vi.fn(),
    downloadToBuffer: vi.fn(),
    deleteIfExists: vi.fn(),
  };
  const container = {
    createIfNotExists: vi.fn(),
    getBlockBlobClient: vi.fn(() => blockBlob),
  };
  const service = { getContainerClient: vi.fn(() => container) };
  const fromConnectionString = vi.fn(() => service);
  return { blockBlob, container, service, fromConnectionString };
});

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: { fromConnectionString: sdk.fromConnectionString },
}));

import {
  getBlobStore,
  resetBlobStoreForTests,
  IMAGE_CONTAINER_NAME,
} from '../../src/lib/blob';

beforeEach(() => {
  vi.clearAllMocks();
  sdk.container.createIfNotExists.mockResolvedValue({});
  resetBlobStoreForTests();
  process.env.BLOB_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
});

describe('Azure blob store', () => {
  it('creates the container once and uploads with the content type', async () => {
    const store = getBlobStore();
    expect(sdk.fromConnectionString).toHaveBeenCalledWith(
      'UseDevelopmentStorage=true',
    );
    expect(sdk.service.getContainerClient).toHaveBeenCalledWith(
      IMAGE_CONTAINER_NAME,
    );

    await store.upload('w1/a.jpg', Buffer.from([1]), 'image/jpeg');
    await store.delete('w1/a.jpg');

    expect(sdk.container.createIfNotExists).toHaveBeenCalledTimes(1);
    expect(sdk.blockBlob.uploadData).toHaveBeenCalledWith(Buffer.from([1]), {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });
    expect(sdk.blockBlob.deleteIfExists).toHaveBeenCalled();
  });

  it('retries container creation after a failure', async () => {
    sdk.container.createIfNotExists
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({});
    const store = getBlobStore();
    await expect(store.delete('x')).rejects.toThrow('transient');
    await store.delete('x');
    expect(sdk.container.createIfNotExists).toHaveBeenCalledTimes(2);
  });

  it('downloads bytes and maps a 404 to null', async () => {
    const store = getBlobStore();
    sdk.blockBlob.downloadToBuffer.mockResolvedValueOnce(Buffer.from([7]));
    expect(await store.download('a')).toEqual(Buffer.from([7]));

    sdk.blockBlob.downloadToBuffer.mockRejectedValueOnce({ statusCode: 404 });
    expect(await store.download('missing')).toBeNull();

    sdk.blockBlob.downloadToBuffer.mockRejectedValueOnce({ statusCode: 500 });
    await expect(store.download('broken')).rejects.toEqual({
      statusCode: 500,
    });
  });
});
