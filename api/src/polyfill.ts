// Node.js 18 does not expose `crypto` as a global by default.
// The @azure/cosmos SDK requires globalThis.crypto (Web Crypto API).
// This polyfill must be loaded before any Cosmos SDK code runs.
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}
