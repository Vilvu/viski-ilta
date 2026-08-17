import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeCosmos, FakeCosmos } from './cosmos';

/**
 * Direct tests of the fake's own contract (not the handlers that use it).
 * These exist because a bug in the fake itself can silently invalidate
 * every test that relies on it — see the seed() etag regression below.
 */
describe('createFakeCosmos', () => {
  let fake: FakeCosmos;

  beforeEach(() => {
    fake = createFakeCosmos();
  });

  it('seed() assigns a single consistent etag: resource._etag matches the etag read() returns', async () => {
    fake.seed('users', [
      {
        id: 'u1',
        displayName: 'A',
        email: 'a@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const { resource, etag } = await fake
      .getContainer('users')
      .item('u1', 'u1')
      .read();

    expect(resource?._etag).toBeDefined();
    expect(resource?._etag).toBe(etag);
  });

  it('a seeded document survives an accessCondition replace keyed on its own _etag', async () => {
    fake.seed('users', [
      {
        id: 'u1',
        displayName: 'A',
        email: 'a@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const { resource } = await fake
      .getContainer('users')
      .item('u1', 'u1')
      .read();
    // The idiomatic Cosmos pattern: use the resource's own _etag for
    // optimistic concurrency, not a separately-returned sibling value.
    const { resource: updated } = await fake
      .getContainer('users')
      .item('u1', 'u1')
      .replace(
        { ...resource!, displayName: 'B' },
        {
          accessCondition: {
            type: 'IfMatch',
            condition: resource!._etag as string,
          },
        },
      );

    expect(updated.displayName).toBe('B');
  });

  it('reset() clears seeded data back to empty', async () => {
    fake.seed('users', [
      {
        id: 'u1',
        displayName: 'A',
        email: 'a@example.com',
        role: 'taster',
        usernameConfirmed: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    fake.reset();

    const { resource } = await fake
      .getContainer('users')
      .item('u1', 'u1')
      .read();
    expect(resource).toBeUndefined();
  });
});
