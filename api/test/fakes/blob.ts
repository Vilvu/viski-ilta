import type { BlobStore } from '../../src/lib/blob';

/**
 * Test-only in-memory blob store. Exposes the stored blobs so tests can assert
 * uploads, replacements and deletions directly.
 */
export interface FakeBlobStore extends BlobStore {
  blobs: Map<string, { data: Buffer; contentType: string }>;
  reset: () => void;
}

export function createFakeBlobStore(): FakeBlobStore {
  const blobs = new Map<string, { data: Buffer; contentType: string }>();
  return {
    blobs,
    reset: () => blobs.clear(),
    upload: async (name, data, contentType) => {
      blobs.set(name, { data: Buffer.from(data), contentType });
    },
    download: async (name) => {
      const blob = blobs.get(name);
      return blob ? Buffer.from(blob.data) : null;
    },
    delete: async (name) => {
      blobs.delete(name);
    },
  };
}
