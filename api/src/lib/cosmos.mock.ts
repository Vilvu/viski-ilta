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
      query: (querySpec: string | QuerySpec) => {
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
        // Extract field name from "c.fieldName"
        const fieldMatch = selectClause.match(/c\.(\w+)/);
        if (fieldMatch) {
          const field = fieldMatch[1];
          results = results.map((doc) => ({ [field]: doc[field] }));
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

// Seed data
function initializeSeedData() {
  const eventsContainer = mockStorage.get('events')!;
  const whiskeysContainer = mockStorage.get('whiskeys')!;
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
    whiskeyCount: 3,
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
    whiskeyCount: 4,
  };

  eventsContainer.set(event1Id, event1);
  eventsContainer.set(event2Id, event2);

  // Whiskeys for Event 1
  const whiskey1Id = uuidv4();
  const whiskey2Id = uuidv4();
  const whiskey3Id = uuidv4();

  const whiskey1: any = {
    id: whiskey1Id,
    eventId: event1Id,
    name: 'Lagavulin 16',
    distillery: 'Lagavulin',
    region: 'Islay',
    age: 16,
    abv: 43,
    description: 'Rich, smoky, and complex',
    createdBy: 'admin',
    createdAt: '2026-05-01T11:00:00Z',
    updatedAt: '2026-05-01T11:00:00Z',
    averageRating: 8.5,
    ratingCount: 2,
  };

  const whiskey2: any = {
    id: whiskey2Id,
    eventId: event1Id,
    name: 'Ardbeg Uigeadail',
    distillery: 'Ardbeg',
    region: 'Islay',
    age: undefined,
    abv: 54.4,
    description: 'Intense peat and smoke',
    createdBy: 'admin',
    createdAt: '2026-05-01T11:15:00Z',
    updatedAt: '2026-05-01T11:15:00Z',
    averageRating: 8.0,
    ratingCount: 1,
  };

  const whiskey3: any = {
    id: whiskey3Id,
    eventId: event1Id,
    name: 'Talisker 10',
    distillery: 'Talisker',
    region: 'Skye',
    age: 10,
    abv: 45.8,
    description: 'Spicy and maritime',
    createdBy: 'admin',
    createdAt: '2026-05-01T11:30:00Z',
    updatedAt: '2026-05-01T11:30:00Z',
    averageRating: 7.5,
    ratingCount: 2,
  };

  whiskeysContainer.set(whiskey1Id, whiskey1);
  whiskeysContainer.set(whiskey2Id, whiskey2);
  whiskeysContainer.set(whiskey3Id, whiskey3);

  // Whiskeys for Event 2
  const whiskey4Id = uuidv4();
  const whiskey5Id = uuidv4();
  const whiskey6Id = uuidv4();
  const whiskey7Id = uuidv4();

  const whiskey4: any = {
    id: whiskey4Id,
    eventId: event2Id,
    name: 'Dalmore King Alexander III',
    distillery: 'Dalmore',
    region: 'Highland',
    age: undefined,
    abv: 40,
    description: 'Rich and fruity Highland malt',
    createdBy: 'admin',
    createdAt: '2026-05-02T11:00:00Z',
    updatedAt: '2026-05-02T11:00:00Z',
    averageRating: 8.0,
    ratingCount: 1,
  };

  const whiskey5: any = {
    id: whiskey5Id,
    eventId: event2Id,
    name: 'Glenmorangie Original',
    distillery: 'Glenmorangie',
    region: 'Highland',
    age: 10,
    abv: 40,
    description: 'Elegant and complex',
    createdBy: 'admin',
    createdAt: '2026-05-02T11:15:00Z',
    updatedAt: '2026-05-02T11:15:00Z',
    averageRating: 7.8,
    ratingCount: 2,
  };

  const whiskey6: any = {
    id: whiskey6Id,
    eventId: event2Id,
    name: 'Oban 14',
    distillery: 'Oban',
    region: 'Highland',
    age: 14,
    abv: 43,
    description: 'Coastal and maritime notes',
    createdBy: 'admin',
    createdAt: '2026-05-02T11:30:00Z',
    updatedAt: '2026-05-02T11:30:00Z',
    averageRating: 8.2,
    ratingCount: 1,
  };

  const whiskey7: any = {
    id: whiskey7Id,
    eventId: event2Id,
    name: 'Balblair 2009',
    distillery: 'Balblair',
    region: 'Highland',
    age: undefined,
    abv: 46,
    description: 'Fruity and spicy Highland character',
    createdBy: 'admin',
    createdAt: '2026-05-02T11:45:00Z',
    updatedAt: '2026-05-02T11:45:00Z',
    averageRating: 7.9,
    ratingCount: 1,
  };

  whiskeysContainer.set(whiskey4Id, whiskey4);
  whiskeysContainer.set(whiskey5Id, whiskey5);
  whiskeysContainer.set(whiskey6Id, whiskey6);
  whiskeysContainer.set(whiskey7Id, whiskey7);

  // Sample ratings
  const rating1: any = {
    id: uuidv4(),
    whiskeyId: whiskey1Id,
    eventId: event1Id,
    userId: 'user1',
    userName: 'Alice',
    score: 9,
    notes: 'Excellent, very smooth',
    createdAt: '2026-05-01T12:00:00Z',
    updatedAt: '2026-05-01T12:00:00Z',
  };

  const rating2: any = {
    id: uuidv4(),
    whiskeyId: whiskey1Id,
    eventId: event1Id,
    userId: 'user2',
    userName: 'Bob',
    score: 8,
    notes: 'Great whisky',
    createdAt: '2026-05-01T12:15:00Z',
    updatedAt: '2026-05-01T12:15:00Z',
  };

  const rating3: any = {
    id: uuidv4(),
    whiskeyId: whiskey2Id,
    eventId: event1Id,
    userId: 'user1',
    userName: 'Alice',
    score: 8,
    notes: 'Very peaty, intense',
    createdAt: '2026-05-01T12:30:00Z',
    updatedAt: '2026-05-01T12:30:00Z',
  };

  const rating4: any = {
    id: uuidv4(),
    whiskeyId: whiskey3Id,
    eventId: event1Id,
    userId: 'user1',
    userName: 'Alice',
    score: 7,
    notes: 'Good spice profile',
    createdAt: '2026-05-01T12:45:00Z',
    updatedAt: '2026-05-01T12:45:00Z',
  };

  const rating5: any = {
    id: uuidv4(),
    whiskeyId: whiskey3Id,
    eventId: event1Id,
    userId: 'user2',
    userName: 'Bob',
    score: 8,
    notes: 'Excellent maritime character',
    createdAt: '2026-05-01T13:00:00Z',
    updatedAt: '2026-05-01T13:00:00Z',
  };

  ratingsContainer.set(rating1.id, rating1);
  ratingsContainer.set(rating2.id, rating2);
  ratingsContainer.set(rating3.id, rating3);
  ratingsContainer.set(rating4.id, rating4);
  ratingsContainer.set(rating5.id, rating5);
}

// Initialize containers and seed data
mockStorage.set('events', new Map());
mockStorage.set('whiskeys', new Map());
mockStorage.set('ratings', new Map());
mockStorage.set('admins', new Map());
initializeSeedData();

// Seed one mock admin for local development
const adminId = uuidv4();
const mockAdmin = {
  id: adminId,
  email: 'admin@example.com',
  createdAt: '2026-06-06T10:00:00Z',
};
mockStorage.get('admins')!.set(adminId, mockAdmin);

export function getMockContainer(containerName: string): MockContainer {
  return new MockContainer(containerName);
}
