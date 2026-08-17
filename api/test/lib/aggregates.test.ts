import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeCosmos } from '../helpers/mockCosmos';

vi.mock('../../src/lib/cosmos', () => ({
  getContainer: (name: string) => fakeCosmos.getContainer(name),
}));

import {
  recomputeEventAggregate,
  recomputeGlobalAggregate,
} from '../../src/lib/aggregates';

beforeEach(() => {
  fakeCosmos.reset();
});

describe('recomputeEventAggregate', () => {
  it('sets averageRating 0 and ratingCount 0 when there are no ratings', async () => {
    fakeCosmos.seed('eventWhiskeys', [
      {
        id: 'link1',
        eventId: 'event1',
        whiskeyId: 'w1',
        addedBy: 'admin',
        addedByUserId: 'admin',
        createdAt: '2026-01-01T00:00:00Z',
        averageRating: 5,
        ratingCount: 3,
      },
    ]);

    await recomputeEventAggregate('event1', 'w1');

    const { resource } = await fakeCosmos
      .getContainer('eventWhiskeys')
      .item('link1', 'event1')
      .read();
    expect(resource).toMatchObject({ averageRating: 0, ratingCount: 0 });
  });

  it('rounds the average to one decimal', async () => {
    fakeCosmos.seed('eventWhiskeys', [
      {
        id: 'link1',
        eventId: 'event1',
        whiskeyId: 'w1',
        addedBy: 'admin',
        addedByUserId: 'admin',
        createdAt: '2026-01-01T00:00:00Z',
        averageRating: 0,
        ratingCount: 0,
      },
    ]);
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: 'event1',
        whiskeyId: 'w1',
        userId: 'u1',
        userName: 'A',
        score: 7,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        eventId: 'event1',
        whiskeyId: 'w1',
        userId: 'u2',
        userName: 'B',
        score: 8,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r3',
        eventId: 'event1',
        whiskeyId: 'w1',
        userId: 'u3',
        userName: 'C',
        score: 8,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    await recomputeEventAggregate('event1', 'w1');

    const { resource } = await fakeCosmos
      .getContainer('eventWhiskeys')
      .item('link1', 'event1')
      .read();
    // (7 + 8 + 8) / 3 = 7.666... -> rounds to 7.7
    expect(resource).toMatchObject({ averageRating: 7.7, ratingCount: 3 });
  });

  it('counts a score of 0 rather than treating it as falsy', async () => {
    fakeCosmos.seed('eventWhiskeys', [
      {
        id: 'link1',
        eventId: 'event1',
        whiskeyId: 'w1',
        addedBy: 'admin',
        addedByUserId: 'admin',
        createdAt: '2026-01-01T00:00:00Z',
        averageRating: 99,
        ratingCount: 99,
      },
    ]);
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: 'event1',
        whiskeyId: 'w1',
        userId: 'u1',
        userName: 'A',
        score: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        eventId: 'event1',
        whiskeyId: 'w1',
        userId: 'u2',
        userName: 'B',
        score: 10,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    await recomputeEventAggregate('event1', 'w1');

    const { resource } = await fakeCosmos
      .getContainer('eventWhiskeys')
      .item('link1', 'event1')
      .read();
    // (0 + 10) / 2 = 5, and ratingCount must be 2 (both ratings counted, not 1)
    expect(resource).toMatchObject({ averageRating: 5, ratingCount: 2 });
  });

  it('does not patch or throw when no link document exists for the pair', async () => {
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: 'event1',
        whiskeyId: 'w1',
        userId: 'u1',
        userName: 'A',
        score: 7,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    await expect(
      recomputeEventAggregate('event1', 'w1'),
    ).resolves.toBeUndefined();
  });
});

describe('recomputeGlobalAggregate', () => {
  it('aggregates ratings across multiple eventId partitions', async () => {
    fakeCosmos.seed('whiskeys', [
      {
        id: 'w1',
        name: 'Lagavulin 16',
        createdBy: 'admin',
        createdByUserId: 'admin',
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 0,
        globalRatingCount: 0,
      },
    ]);
    fakeCosmos.seed('ratings', [
      {
        id: 'r1',
        eventId: 'event1',
        whiskeyId: 'w1',
        userId: 'u1',
        userName: 'A',
        score: 9,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        eventId: 'event1',
        whiskeyId: 'w1',
        userId: 'u2',
        userName: 'B',
        score: 8,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r3',
        eventId: 'event2',
        whiskeyId: 'w1',
        userId: 'u1',
        userName: 'A',
        score: 7,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    await recomputeGlobalAggregate('w1');

    const { resource } = await fakeCosmos
      .getContainer('whiskeys')
      .item('w1', 'w1')
      .read();
    // (9 + 8 + 7) / 3 = 8
    expect(resource).toMatchObject({
      globalAverageRating: 8,
      globalRatingCount: 3,
    });
  });

  it('requests enableCrossPartitionQuery for the ratings query', async () => {
    fakeCosmos.seed('whiskeys', [
      {
        id: 'w1',
        name: 'Lagavulin 16',
        createdBy: 'admin',
        createdByUserId: 'admin',
        createdAt: '',
        updatedAt: '',
        globalAverageRating: 0,
        globalRatingCount: 0,
      },
    ]);

    await recomputeGlobalAggregate('w1');

    const ratingsCall = fakeCosmos.calls.find(
      (call) =>
        call.container === 'ratings' && call.query.includes('c.whiskeyId'),
    );
    expect(ratingsCall).toBeDefined();
    expect(ratingsCall?.enableCrossPartitionQuery).toBe(true);
  });
});
