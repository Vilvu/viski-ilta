import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

/**
 * Minimal blob storage seam used for whiskey bottle photos.
 *
 * Mirrors the cosmos.ts pattern: production code calls `getBlobStore()`, which
 * returns an Azure Blob Storage implementation, or an in-memory store when
 * `USE_BLOB_MOCK=true` (local development). Tests mock this module directly.
 */
export interface BlobStore {
  upload(name: string, data: Buffer, contentType: string): Promise<void>;
  /** Returns the blob bytes, or null when the blob does not exist. */
  download(name: string): Promise<Buffer | null>;
  /** Deletes the blob if it exists; never throws for a missing blob. */
  delete(name: string): Promise<void>;
}

export const IMAGE_CONTAINER_NAME = 'whiskey-images';

/** In-memory store used for local development (USE_BLOB_MOCK=true). */
export function createMemoryBlobStore(): BlobStore {
  const blobs = new Map<string, Buffer>();
  return {
    upload: async (name, data) => {
      blobs.set(name, Buffer.from(data));
    },
    download: async (name) => {
      const data = blobs.get(name);
      return data ? Buffer.from(data) : null;
    },
    delete: async (name) => {
      blobs.delete(name);
    },
  };
}

function createAzureBlobStore(connectionString: string): BlobStore {
  const container: ContainerClient =
    BlobServiceClient.fromConnectionString(connectionString).getContainerClient(
      IMAGE_CONTAINER_NAME,
    );
  // Create the private container lazily, once per process.
  let ready: Promise<unknown> | null = null;
  const ensureContainer = () => {
    if (!ready) {
      ready = container.createIfNotExists().catch((error: unknown) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  };

  return {
    upload: async (name, data, contentType) => {
      await ensureContainer();
      await container.getBlockBlobClient(name).uploadData(data, {
        blobHTTPHeaders: { blobContentType: contentType },
      });
    },
    download: async (name) => {
      await ensureContainer();
      try {
        return await container.getBlockBlobClient(name).downloadToBuffer();
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error !== null &&
          (error as { statusCode?: number }).statusCode === 404
        ) {
          return null;
        }
        throw error;
      }
    },
    delete: async (name) => {
      await ensureContainer();
      await container.getBlockBlobClient(name).deleteIfExists();
    },
  };
}

let store: BlobStore | null = null;

export function getBlobStore(): BlobStore {
  if (store) return store;

  if (process.env.USE_BLOB_MOCK === 'true') {
    store = createMemoryBlobStore();
    return store;
  }

  const connectionString = process.env.BLOB_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      'BLOB_STORAGE_CONNECTION_STRING environment variable is required ' +
        '(or set USE_BLOB_MOCK=true for local development)',
    );
  }
  store = createAzureBlobStore(connectionString);
  return store;
}

/** Test-only: drop the memoized store so env changes take effect. */
export function resetBlobStoreForTests(): void {
  store = null;
}
