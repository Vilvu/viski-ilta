import { v4 as uuidv4 } from 'uuid';

// In-memory storage: containerName -> id -> document
const mockStorage = new Map<string, Map<string, any>>();

interface QuerySpec {
  query: string;
  parameters?: Array<{ name: string; value: any }>;
}

interface PatchOperation {
  op: 'set' | 'incr';
  path: string;
  value: any;
}

class MockContainer {
  private containerName: string;

  constructor(containerName: string) {
    this.containerName = containerName;
    if (!mockStorage.has(containerName)) {
      mockStorage.set(containerName, new Map());
    }
  }

  get items() {
    return {
      // _options is accepted but ignored; the mock queries all items regardless of partition
      query: (querySpec: string | QuerySpec, _options?: Record<string, unknown>) => {
        return {
          fetchAll: async () => {
            const spec =
              typeof querySpec === 'string' ? { query: querySpec } : querySpec;
            const resources = this.executeQuery(spec);
            return { resources };
          },
        };
      },
      create: async (item: any) => {
        const container = mockStorage.get(this.containerName)!;
        container.set(item.id, { ...item });
        return { resource: item };
      },
    };
  }

  item(id: string, _partitionKey: string) {
    return {
      read: async () => {
        const container = mockStorage.get(this.containerName)!;
        const resource = container.get(id);
        return { resource };
      },
      replace: async (item: any) => {
        const container = mockStorage.get(this.containerName)!;
        container.set(id, { ...item });
        return { resource: item };
      },
      delete: async () => {
        const container = mockStorage.get(this.containerName)!;
        container.delete(id);
      },
      patch: async (operations: PatchOperation[]) => {
        const container = mockStorage.get(this.containerName)!;
        const doc = container.get(id);
        if (!doc) return { resource: undefined };

        for (const op of operations) {
          const fieldName = op.path.replace(/^\//, '');
          if (op.op === 'set') {
            doc[fieldName] = op.value;
          } else if (op.op === 'incr') {
            doc[fieldName] = (doc[fieldName] ?? 0) + op.value;
          }
        }

        container.set(id, doc);
        return { resource: doc };
      },
    };
  }

  private executeQuery(spec: QuerySpec): any[] {
    const container = mockStorage.get(this.containerName)!;
    let results = Array.from(container.values());

    // Parse and execute WHERE clause
    const whereMatch = spec.query.match(/WHERE\s+(.+?)(?:\s+ORDER BY|$)/i);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      results = results.filter((doc) =>
        this.evaluateWhere(doc, whereClause, spec.parameters),
      );
    }

    // Parse and execute ORDER BY clause
    const orderMatch = spec.query.match(/ORDER BY\s+c\.(\w+)\s*(DESC|ASC)?/i);
    if (orderMatch) {
      const field = orderMatch[1];
      const direction = orderMatch[2]?.toUpperCase() === 'DESC' ? -1 : 1;
      results.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal < bVal) return -1 * direction;
        if (aVal > bVal) return 1 * direction;
        return 0;
      });
    }

    // Parse and execute SELECT clause (field projection)
    const selectMatch = spec.query.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
      const selectClause = selectMatch[1].trim();
      if (selectClause !== '*') {
        // Extract all "c.fieldName" tokens from the SELECT clause
        const fieldMatches = [...selectClause.matchAll(/c\.(\w+)/g)];
        if (fieldMatches.length > 0) {
          const fields = fieldMatches.map((m) => m[1]);
          results = results.map((doc) => {
            const projected: Record<string, any> = {};
            for (const field of fields) {
              projected[field] = doc[field];
            }
            return projected;
          });
        }
      }
    }

    return results;
  }

  private evaluateWhere(
    doc: any,
    whereClause: string,
    parameters?: Array<{ name: string; value: any }>,
  ): boolean {
    // Split by AND
    const conditions = whereClause.split(/\s+AND\s+/i);

    for (const condition of conditions) {
      const match = condition.match(/c\.(\w+)\s*=\s*(@\w+)/);
      if (!match) continue;

      const field = match[1];
      const paramName = match[2];
      const paramValue = parameters?.find((p) => p.name === paramName)?.value;

      if (doc[field] !== paramValue) {
        return false;
      }
    }

    return true;
  }
}

// Seed data — new decoupled schema
function initializeSeedData() {
  const eventsContainer = mockStorage.get('events')!;
  const whiskeysContainer = mockStorage.get('whiskeys')!;
  const eventWhiskeysContainer = mockStorage.get('eventWhiskeys')!;
  const ratingsContainer = mockStorage.get('ratings')!;

  // Events
  const event1Id = uuidv4();
  const event2Id = uuidv4();

  const event1: any = {
    id: event1Id,
    name: 'Islay Whisky Festival 2026',
    description: 'A celebration of peaty Islay whiskies',
    date: '2026-06-15',
    location: 'Islay, Scotland',
    createdBy: 'admin',
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-05-01T10:00:00Z',
    whiskeyCount: 3, // 3 links: lagavulin, ardbeg, talisker
  };

  const event2: any = {
    id: event2Id,
    name: 'Highland Whisky Tasting',
    description: 'Exploring the finest Highland single malts',
    date: '2026-07-20',
    location: 'Edinburgh, Scotland',
    createdBy: 'admin',
    createdAt: '2026-05-02T10:00:00Z',
    updatedAt: '2026-05-02T10:00:00Z',
    whiskeyCount: 5, // 5 links: dalmore, glenmorangie, oban, balblair, lagavulin (reused)
  };

  eventsContainer.set(event1Id, event1);
  eventsContainer.set(event2Id, event2);

  // Catalog whiskeys (partition /id, no eventId)
  const w_lagavulin = {
    id: 'w_lagavulin',
    name: 'Lagavulin 16',
    distillery: 'Lagavulin',
    region: 'Islay',
    age: 16,
    abv: 43,
    description: 'Rich, smoky, and complex',
    createdBy: 'admin',
    createdByUserId: 'admin',
    createdAt: '2026-05-01T11:00:00Z',
    updatedAt: '2026-05-01T11:00:00Z',
    // Global: rated in both events. Event1: Alice=9, Bob=8 (avg 8.5, count 2).
    // Event2: Alice=7 (avg 7, count 1). Global: (9+8+7)/3 = 8, count 3.
    globalAverageRating: 8,
    globalRatingCount: 3,
  };

  const w_ardbeg = {
    id: 'w_ardbeg',
    name: 'Ardbeg Uigeadail',
    distillery: 'Ardbeg',
    region: 'Islay',
    age: undefined,
    abv: 54.4,
    description: 'Intense peat and smoke',
    createdBy: 'admin',
    createdByUserId: 'admin',
    createdAt: '2026-05-01T11:15:00Z',
    updatedAt: '2026-05-01T11:15:00Z',
    // Event1 only: Alice=8. Global: (8)/1 = 8, count 1.
    globalAverageRating: 8,
    globalRatingCount: 1,
  };

  const w_talisker = {
    id: 'w_talisker',
    name: 'Talisker 10',
    distillery: 'Talisker',
    region: 'Skye',
    age: 10,
    abv: 45.8,
    description: 'Spicy and maritime',
    createdBy: 'admin',
    createdByUserId: 'admin',
    createdAt: '2026-05-01T11:30:00Z',
    updatedAt: '2026-05-01T11:30:00Z',
    // Event1 only: Alice=7, Bob=8. Global: (7+8)/2 = 7.5, count 2.
    globalAverageRating: 7.5,
    globalRatingCount: 2,
  };

  const w_dalmore = {
    id: 'w_dalmore',
    name: 'Dalmore King Alexander III',
    distillery: 'Dalmore',
    region: 'Highland',
    age: undefined,
    abv: 40,
    description: 'Rich and fruity Highland malt',
    createdBy: 'admin',
    createdByUserId: 'admin',
    createdAt: '2026-05-02T11:00:00Z',
    updatedAt: '2026-05-02T11:00:00Z',
    // Event2 only: Bob=8. Global: (8)/1 = 8, count 1.
    globalAverageRating: 8,
    globalRatingCount: 1,
  };

  const w_glenmorangie = {
    id: 'w_glenmorangie',
    name: 'Glenmorangie Original',
    distillery: 'Glenmorangie',
    region: 'Highland',
    age: 10,
    abv: 40,
    description: 'Elegant and complex',
    createdBy: 'admin',
    createdByUserId: 'admin',
    createdAt: '2026-05-02T11:15:00Z',
    updatedAt: '2026-05-02T11:15:00Z',
    // Event2 only: Alice=8, Bob=7. Global: (8+7)/2 = 7.5, count 2.
    globalAverageRating: 7.5,
    globalRatingCount: 2,
  };

  const w_oban = {
    id: 'w_oban',
    name: 'Oban 14',
    distillery: 'Oban',
    region: 'Highland',
    age: 14,
    abv: 43,
    description: 'Coastal and maritime notes',
    createdBy: 'admin',
    createdByUserId: 'admin',
    createdAt: '2026-05-02T11:30:00Z',
    updatedAt: '2026-05-02T11:30:00Z',
    // Event2 only: Bob=8.2. Global: (8.2)/1 = 8.2, count 1.
    globalAverageRating: 8.2,
    globalRatingCount: 1,
  };

  const w_balblair = {
    id: 'w_balblair',
    name: 'Balblair 2009',
    distillery: 'Balblair',
    region: 'Highland',
    age: undefined,
    abv: 46,
    description: 'Fruity and spicy Highland character',
    createdBy: 'admin',
    createdByUserId: 'admin',
    createdAt: '2026-05-02T11:45:00Z',
    updatedAt: '2026-05-02T11:45:00Z',
    // Event2 only: Alice=8. Global: (8)/1 = 8, count 1.
    globalAverageRating: 8,
    globalRatingCount: 1,
  };

  whiskeysContainer.set(w_lagavulin.id, w_lagavulin);
  whiskeysContainer.set(w_ardbeg.id, w_ardbeg);
  whiskeysContainer.set(w_talisker.id, w_talisker);
  whiskeysContainer.set(w_dalmore.id, w_dalmore);
  whiskeysContainer.set(w_glenmorangie.id, w_glenmorangie);
  whiskeysContainer.set(w_oban.id, w_oban);
  whiskeysContainer.set(w_balblair.id, w_balblair);

  // Event ↔ Whiskey links (eventWhiskeys, partition /eventId)
  // Event1: lagavulin, ardbeg, talisker (3 links)
  const link1 = {
    id: uuidv4(),
    eventId: event1Id,
    whiskeyId: 'w_lagavulin',
    addedBy: 'admin',
    addedByUserId: 'admin',
    createdAt: '2026-05-01T11:00:00Z',
    // Event-scoped: Event1 ratings for lagavulin: Alice=9, Bob=8. Avg=8.5, count=2.
    averageRating: 8.5,
    ratingCount: 2,
  };

  const link2 = {
    id: uuidv4(),
    eventId: event1Id,
    whiskeyId: 'w_ardbeg',
    addedBy: 'admin',
    addedByUserId: 'admin',
    createdAt: '2026-05-01T11:15:00Z',
    // Event-scoped: Event1 ratings for ardbeg: Alice=8. Avg=8, count=1.
    averageRating: 8,
    ratingCount: 1,
  };

  const link3 = {
    id: uuidv4(),
    eventId: event1Id,
    whiskeyId: 'w_talisker',
    addedBy: 'admin',
    addedByUserId: 'admin',
    createdAt: '2026-05-01T11:30:00Z',
    // Event-scoped: Event1 ratings for talisker: Alice=7, Bob=8. Avg=7.5, count=2.
    averageRating: 7.5,
    ratingCount: 2,
  };

  // Event2: dalmore, glenmorangie, oban, balblair, lagavulin (5 links, lagavulin reused)
  const link4 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_dalmore',
    addedBy: 'admin',
    addedByUserId: 'admin',
    createdAt: '2026-05-02T11:00:00Z',
    // Event-scoped: Event2 ratings for dalmore: Bob=8. Avg=8, count=1.
    averageRating: 8,
    ratingCount: 1,
  };

  const link5 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_glenmorangie',
    addedBy: 'admin',
    addedByUserId: 'admin',
    createdAt: '2026-05-02T11:15:00Z',
    // Event-scoped: Event2 ratings for glenmorangie: Alice=8, Bob=7. Avg=7.5, count=2.
    averageRating: 7.5,
    ratingCount: 2,
  };

  const link6 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_oban',
    addedBy: 'admin',
    addedByUserId: 'admin',
    createdAt: '2026-05-02T11:30:00Z',
    // Event-scoped: Event2 ratings for oban: Bob=8.2. Avg=8.2, count=1.
    averageRating: 8.2,
    ratingCount: 1,
  };

  const link7 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_balblair',
    addedBy: 'admin',
    addedByUserId: 'admin',
    createdAt: '2026-05-02T11:45:00Z',
    // Event-scoped: Event2 ratings for balblair: Alice=8. Avg=8, count=1.
    averageRating: 8,
    ratingCount: 1,
  };

  // Lagavulin reused in Event2: different event-scoped average than Event1
  const link8 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_lagavulin',
    addedBy: 'admin',
    addedByUserId: 'admin',
    createdAt: '2026-05-02T12:00:00Z',
    // Event-scoped: Event2 ratings for lagavulin: Alice=7. Avg=7, count=1.
    // Note: this differs from Event1 (avg=8.5), proving per-event aggregation.
    averageRating: 7,
    ratingCount: 1,
  };

  eventWhiskeysContainer.set(link1.id, link1);
  eventWhiskeysContainer.set(link2.id, link2);
  eventWhiskeysContainer.set(link3.id, link3);
  eventWhiskeysContainer.set(link4.id, link4);
  eventWhiskeysContainer.set(link5.id, link5);
  eventWhiskeysContainer.set(link6.id, link6);
  eventWhiskeysContainer.set(link7.id, link7);
  eventWhiskeysContainer.set(link8.id, link8);

  // Ratings (partition /eventId, unique per (eventId, whiskeyId, userId))
  // Event1 ratings
  const rating1 = {
    id: uuidv4(),
    eventId: event1Id,
    whiskeyId: 'w_lagavulin',
    userId: 'user1',
    userName: 'Alice',
    score: 9,
    notes: 'Excellent, very smooth',
    createdAt: '2026-05-01T12:00:00Z',
    updatedAt: '2026-05-01T12:00:00Z',
  };

  const rating2 = {
    id: uuidv4(),
    eventId: event1Id,
    whiskeyId: 'w_lagavulin',
    userId: 'user2',
    userName: 'Bob',
    score: 8,
    notes: 'Great whisky',
    createdAt: '2026-05-01T12:15:00Z',
    updatedAt: '2026-05-01T12:15:00Z',
  };

  const rating3 = {
    id: uuidv4(),
    eventId: event1Id,
    whiskeyId: 'w_ardbeg',
    userId: 'user1',
    userName: 'Alice',
    score: 8,
    notes: 'Very peaty, intense',
    createdAt: '2026-05-01T12:30:00Z',
    updatedAt: '2026-05-01T12:30:00Z',
  };

  const rating4 = {
    id: uuidv4(),
    eventId: event1Id,
    whiskeyId: 'w_talisker',
    userId: 'user1',
    userName: 'Alice',
    score: 7,
    notes: 'Good spice profile',
    createdAt: '2026-05-01T12:45:00Z',
    updatedAt: '2026-05-01T12:45:00Z',
  };

  const rating5 = {
    id: uuidv4(),
    eventId: event1Id,
    whiskeyId: 'w_talisker',
    userId: 'user2',
    userName: 'Bob',
    score: 8,
    notes: 'Excellent maritime character',
    createdAt: '2026-05-01T13:00:00Z',
    updatedAt: '2026-05-01T13:00:00Z',
  };

  // Event2 ratings (alice rates lagavulin differently across events)
  const rating6 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_lagavulin',
    userId: 'user1',
    userName: 'Alice',
    score: 7, // Different from Event1 (9)
    notes: 'Good but prefer the Islay pour',
    createdAt: '2026-05-02T12:00:00Z',
    updatedAt: '2026-05-02T12:00:00Z',
  };

  const rating7 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_dalmore',
    userId: 'user2',
    userName: 'Bob',
    score: 8,
    notes: 'Rich and fruity',
    createdAt: '2026-05-02T12:15:00Z',
    updatedAt: '2026-05-02T12:15:00Z',
  };

  const rating8 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_glenmorangie',
    userId: 'user1',
    userName: 'Alice',
    score: 8,
    notes: 'Very elegant',
    createdAt: '2026-05-02T12:30:00Z',
    updatedAt: '2026-05-02T12:30:00Z',
  };

  const rating9 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_glenmorangie',
    userId: 'user2',
    userName: 'Bob',
    score: 7,
    notes: 'Nice but a bit light',
    createdAt: '2026-05-02T12:45:00Z',
    updatedAt: '2026-05-02T12:45:00Z',
  };

  const rating10 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_oban',
    userId: 'user2',
    userName: 'Bob',
    score: 8.2,
    notes: 'Excellent coastal notes',
    createdAt: '2026-05-02T13:00:00Z',
    updatedAt: '2026-05-02T13:00:00Z',
  };

  const rating11 = {
    id: uuidv4(),
    eventId: event2Id,
    whiskeyId: 'w_balblair',
    userId: 'user1',
    userName: 'Alice',
    score: 8,
    notes: 'Fruity and spicy',
    createdAt: '2026-05-02T13:15:00Z',
    updatedAt: '2026-05-02T13:15:00Z',
  };

  ratingsContainer.set(rating1.id, rating1);
  ratingsContainer.set(rating2.id, rating2);
  ratingsContainer.set(rating3.id, rating3);
  ratingsContainer.set(rating4.id, rating4);
  ratingsContainer.set(rating5.id, rating5);
  ratingsContainer.set(rating6.id, rating6);
  ratingsContainer.set(rating7.id, rating7);
  ratingsContainer.set(rating8.id, rating8);
  ratingsContainer.set(rating9.id, rating9);
  ratingsContainer.set(rating10.id, rating10);
  ratingsContainer.set(rating11.id, rating11);
}

// Initialize containers and seed data
mockStorage.set('events', new Map());
mockStorage.set('whiskeys', new Map());
mockStorage.set('ratings', new Map());
mockStorage.set('eventWhiskeys', new Map());
mockStorage.set('users', new Map());
initializeSeedData();

export function getMockContainer(containerName: string): MockContainer {
  return new MockContainer(containerName);
}
