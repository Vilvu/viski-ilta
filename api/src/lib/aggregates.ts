import { getContainer } from './cosmos';

/**
 * Recompute event-scoped aggregate (averageRating, ratingCount) for a link.
 * Queries all ratings WHERE eventId AND whiskeyId, computes mean (rounded to 1 decimal),
 * and patches the eventWhiskeys link document.
 *
 * @param eventId - Event ID (partition key)
 * @param whiskeyId - Whiskey ID to recompute ratings for
 */
export async function recomputeEventAggregate(
  eventId: string,
  whiskeyId: string,
): Promise<void> {
  const ratingsContainer = getContainer('ratings');
  const eventWhiskeysContainer = getContainer('eventWhiskeys');

  // Query all ratings for this (eventId, whiskeyId) combination
  const { resources: ratings } = await ratingsContainer.items
    .query({
      query:
        'SELECT c.score FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId',
      parameters: [
        { name: '@eventId', value: eventId },
        { name: '@whiskeyId', value: whiskeyId },
      ],
    })
    .fetchAll();

  // Compute average and count
  const ratingCount = ratings.length;
  const averageRating =
    ratingCount > 0
      ? Math.round(
          (ratings.reduce((sum: number, r: any) => sum + r.score, 0) / ratingCount) * 10,
        ) / 10
      : 0;

  // Find the link document for this (eventId, whiskeyId)
  const { resources: links } = await eventWhiskeysContainer.items
    .query({
      query:
        'SELECT c.id FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId',
      parameters: [
        { name: '@eventId', value: eventId },
        { name: '@whiskeyId', value: whiskeyId },
      ],
    })
    .fetchAll();

  if (links.length > 0) {
    const linkId = links[0].id;
    // Patch the link with updated aggregates
    await eventWhiskeysContainer
      .item(linkId, eventId)
      .patch([
        { op: 'set', path: '/averageRating', value: averageRating },
        { op: 'set', path: '/ratingCount', value: ratingCount },
      ]);
  }
}

/**
 * Recompute global aggregate (globalAverageRating, globalRatingCount) for a whiskey.
 * Queries all ratings WHERE whiskeyId (across all events), computes mean (rounded to 1 decimal),
 * and patches the whiskey document.
 *
 * @param whiskeyId - Whiskey ID (partition key)
 */
export async function recomputeGlobalAggregate(whiskeyId: string): Promise<void> {
  const ratingsContainer = getContainer('ratings');
  const whiskeysContainer = getContainer('whiskeys');

  // Query all ratings for this whiskey (across all events).
  // Requires cross-partition fan-out: ratings are partitioned by /eventId,
  // so this query touches every partition. enableCrossPartitionQuery is required.
  const { resources: ratings } = await ratingsContainer.items
    .query(
      {
        query: 'SELECT c.score FROM c WHERE c.whiskeyId = @whiskeyId',
        parameters: [{ name: '@whiskeyId', value: whiskeyId }],
      },
      { enableCrossPartitionQuery: true },
    )
    .fetchAll();

  // Compute average and count
  const ratingCount = ratings.length;
  const globalAverageRating =
    ratingCount > 0
      ? Math.round(
          (ratings.reduce((sum: number, r: any) => sum + r.score, 0) / ratingCount) * 10,
        ) / 10
      : 0;

  // Patch the whiskey with updated global aggregates
  await whiskeysContainer
    .item(whiskeyId, whiskeyId)
    .patch([
      { op: 'set', path: '/globalAverageRating', value: globalAverageRating },
      { op: 'set', path: '/globalRatingCount', value: ratingCount },
    ]);
}
