import { createFakeCosmos, FakeCosmos } from '../fakes/cosmos';

/**
 * Shared fake instance for a single test file. Vitest isolates module
 * registries per test file by default, so this module (and therefore this
 * singleton) is fresh per file — no cross-file leakage. Within a file,
 * call `fakeCosmos.reset()` in `beforeEach` to avoid cross-test leakage.
 *
 * Usage in a test file:
 *
 *   import { fakeCosmos } from '../helpers/mockCosmos';
 *
 *   vi.mock('../../src/lib/cosmos', () => ({
 *     getContainer: (name: string) => fakeCosmos.getContainer(name),
 *   }));
 */
export const fakeCosmos: FakeCosmos = createFakeCosmos();
