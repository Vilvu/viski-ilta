import { createFakeBlobStore, FakeBlobStore } from '../fakes/blob';

/**
 * Shared fake blob store for a single test file (fresh per file, like
 * mockCosmos.ts). Call `fakeBlob.reset()` in `beforeEach`.
 *
 *   vi.mock('../../src/lib/blob', () => ({
 *     getBlobStore: () => fakeBlob,
 *   }));
 */
export const fakeBlob: FakeBlobStore = createFakeBlobStore();
