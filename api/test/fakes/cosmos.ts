/**
 * Hardened, test-only in-memory Cosmos DB fake.
 *
 * Unlike `src/lib/cosmos.mock.ts` (the dev fake, which is pre-seeded and
 * lenient), this fake:
 *   - starts completely empty for every container until `seed()` is called,
 *   - throws on any query syntax it does not explicitly recognize instead of
 *     silently returning an empty array (a silent `[]` would turn a real bug
 *     into a green test),
 *   - implements ETag-based optimistic concurrency (`accessCondition.ifMatch`,
 *     412 on mismatch) so the retry loops in `users.ts` / `auth.ts` are
 *     actually exercised,
 *   - throws on any unknown `patch()` operation (this is what catches the
 *     `op: 'increment'` bug — 'increment' is not a valid op).
 *
 * Supported query syntax is intentionally narrow: it covers exactly the
 * `query:` strings that appear under `api/src`. If a handler's query
 * changes, extend the evaluator here — never make it lenient.
 */

export interface FakeQueryParameter {
  name: string;
  value: unknown;
}

export interface FakeQuerySpec {
  query: string;
  parameters?: FakeQueryParameter[];
}

export interface FakePatchOperation {
  op: 'set' | 'incr' | 'add' | 'remove';
  path: string;
  value?: unknown;
}

export interface FakeAccessCondition {
  accessCondition?: { type: 'IfMatch'; condition: string };
}

export interface FakeQueryCall {
  container: string;
  query: string;
  parameters: FakeQueryParameter[];
  enableCrossPartitionQuery: boolean;
}

type Doc = Record<string, unknown> & { id: string };

interface StoredDoc {
  doc: Doc;
  partitionKeyValue: string;
  etag: string;
}

/** Partition key field for each container, per the data model in the plan. */
const PARTITION_KEY_FIELD: Record<string, string> = {
  events: 'id',
  whiskeys: 'id',
  eventWhiskeys: 'eventId',
  ratings: 'eventId',
  users: 'id',
};

function partitionKeyFieldFor(containerName: string): string {
  const field = PARTITION_KEY_FIELD[containerName];
  if (!field) {
    throw new Error(
      `FakeCosmos: unknown container "${containerName}" — add it to PARTITION_KEY_FIELD`,
    );
  }
  return field;
}

let etagCounter = 0;
function nextEtag(): string {
  etagCounter += 1;
  return `etag-${etagCounter}`;
}

/**
 * The full-query regex. Matches exactly:
 *   SELECT [TOP n] (* | c.field[, c.field...])
 *   FROM c
 *   [WHERE c.field = @param [AND c.field = @param ...]]
 *   [ORDER BY c.field [DESC|ASC]]
 *   [OFFSET @param LIMIT @param]
 * Anything else fails to match and the evaluator throws.
 */
const QUERY_RE = new RegExp(
  '^SELECT\\s+(?:TOP\\s+(?<top>\\d+)\\s+)?(?<select>\\*|c\\.\\w+(?:\\s*,\\s*c\\.\\w+)*)\\s+FROM\\s+c' +
    '(?:\\s+WHERE\\s+(?<where>c\\.\\w+\\s*=\\s*@\\w+(?:\\s+AND\\s+c\\.\\w+\\s*=\\s*@\\w+)*))?' +
    '(?:\\s+ORDER\\s+BY\\s+c\\.(?<orderField>\\w+)(?:\\s+(?<orderDir>DESC|ASC))?)?' +
    '(?:\\s+OFFSET\\s+(?<offset>@\\w+)\\s+LIMIT\\s+(?<limit>@\\w+))?$',
  'i',
);

function resolveParam(
  name: string,
  parameters: FakeQueryParameter[] | undefined,
): unknown {
  const found = parameters?.find((p) => p.name === name);
  if (!found) {
    throw new Error(`FakeCosmos: missing query parameter "${name}"`);
  }
  return found.value;
}

interface ItemAccessor {
  read: () => Promise<{ resource: Doc | undefined; etag: string | undefined }>;
  replace: (
    newItem: Doc,
    options?: FakeAccessCondition,
  ) => Promise<{ resource: Doc }>;
  delete: (options?: FakeAccessCondition) => Promise<void>;
  patch: (
    operations: FakePatchOperation[],
    options?: FakeAccessCondition,
  ) => Promise<{ resource: Doc }>;
}

class FakeContainerImpl {
  // Memoized per (id, partitionKey) so vi.spyOn on a previously-obtained
  // accessor's methods also affects the handler code under test, which
  // calls container.item(id, pk) fresh on every access.
  private readonly itemAccessors = new Map<string, ItemAccessor>();

  constructor(
    private readonly name: string,
    private readonly storage: Map<string, StoredDoc>,
    private readonly calls: FakeQueryCall[],
  ) {}

  readonly items = (() => {
    return {
      query: (
        querySpec: string | FakeQuerySpec,
        options?: { enableCrossPartitionQuery?: boolean },
      ) => {
        const spec: FakeQuerySpec =
          typeof querySpec === 'string' ? { query: querySpec } : querySpec;
        this.calls.push({
          container: this.name,
          query: spec.query,
          parameters: spec.parameters ?? [],
          enableCrossPartitionQuery:
            options?.enableCrossPartitionQuery ?? false,
        });
        return {
          fetchAll: async () => ({
            resources: this.executeQuery(spec),
          }),
        };
      },
      create: async (item: Doc) => {
        if (this.storage.has(item.id)) {
          throw Object.assign(
            new Error(
              `FakeCosmos: duplicate id "${item.id}" in "${this.name}"`,
            ),
            { code: 409 },
          );
        }
        const pkField = partitionKeyFieldFor(this.name);
        const partitionKeyValue = String(item[pkField]);
        const stored: StoredDoc = {
          doc: { ...item, _etag: nextEtag() },
          partitionKeyValue,
          etag: '',
        };
        stored.etag = stored.doc._etag as string;
        this.storage.set(item.id, stored);
        return { resource: { ...stored.doc } };
      },
    };
  })();

  item(id: string, partitionKey: string): ItemAccessor {
    const cacheKey = `${id}::${partitionKey}`;
    const cached = this.itemAccessors.get(cacheKey);
    if (cached) return cached;

    const accessor = this.buildItemAccessor(id, partitionKey);
    this.itemAccessors.set(cacheKey, accessor);
    return accessor;
  }

  private buildItemAccessor(id: string, partitionKey: string): ItemAccessor {
    const find = (): StoredDoc | undefined => {
      const stored = this.storage.get(id);
      if (!stored) return undefined;
      // A doc must not be returned across a partition-key mismatch — this
      // surfaces cross-partition bugs instead of silently succeeding.
      if (stored.partitionKeyValue !== partitionKey) return undefined;
      return stored;
    };

    const checkAccessCondition = (
      options?: FakeAccessCondition,
      stored?: StoredDoc,
    ) => {
      const condition = options?.accessCondition;
      if (!condition) return;
      if (!stored || stored.etag !== condition.condition) {
        throw Object.assign(new Error('FakeCosmos: Precondition Failed'), {
          code: 412,
        });
      }
    };

    return {
      read: async () => {
        const stored = find();
        return {
          resource: stored ? { ...stored.doc } : undefined,
          etag: stored?.etag,
        };
      },
      replace: async (newItem: Doc, options?: FakeAccessCondition) => {
        const stored = find();
        if (!stored) {
          throw Object.assign(
            new Error(`FakeCosmos: "${id}" not found in "${this.name}"`),
            { code: 404 },
          );
        }
        checkAccessCondition(options, stored);
        const pkField = partitionKeyFieldFor(this.name);
        const partitionKeyValue = String(newItem[pkField]);
        const updated: StoredDoc = {
          doc: { ...newItem, _etag: nextEtag() },
          partitionKeyValue,
          etag: '',
        };
        updated.etag = updated.doc._etag as string;
        this.storage.set(id, updated);
        return { resource: { ...updated.doc } };
      },
      delete: async (options?: FakeAccessCondition) => {
        const stored = find();
        if (!stored) {
          throw Object.assign(
            new Error(`FakeCosmos: "${id}" not found in "${this.name}"`),
            { code: 404 },
          );
        }
        checkAccessCondition(options, stored);
        this.storage.delete(id);
      },
      patch: async (
        operations: FakePatchOperation[],
        options?: FakeAccessCondition,
      ) => {
        const stored = find();
        if (!stored) {
          throw Object.assign(
            new Error(`FakeCosmos: "${id}" not found in "${this.name}"`),
            { code: 404 },
          );
        }
        checkAccessCondition(options, stored);

        const doc = { ...stored.doc };
        for (const op of operations) {
          const field = op.path.replace(/^\//, '');
          switch (op.op) {
            case 'set':
              doc[field] = op.value;
              break;
            case 'incr': {
              const current = doc[field];
              const base = typeof current === 'number' ? current : 0;
              doc[field] = base + (op.value as number);
              break;
            }
            case 'add': {
              const current = doc[field];
              if (Array.isArray(current)) {
                doc[field] = [...current, op.value];
              } else {
                doc[field] = op.value;
              }
              break;
            }
            case 'remove':
              delete doc[field];
              break;
            default:
              // Fails loudly on anything not in the whitelist above —
              // this is what catches the `op: 'increment'` bug (the real
              // Cosmos PatchOperationType has no 'increment').
              throw new Error(
                `FakeCosmos: unsupported patch op "${(op as { op: string }).op}"`,
              );
          }
        }

        const pkField = partitionKeyFieldFor(this.name);
        const updated: StoredDoc = {
          doc: { ...doc, _etag: nextEtag() },
          partitionKeyValue: String(doc[pkField]),
          etag: '',
        };
        updated.etag = updated.doc._etag as string;
        this.storage.set(id, updated);
        return { resource: { ...updated.doc } };
      },
    };
  }

  private executeQuery(spec: FakeQuerySpec): Doc[] {
    const match = QUERY_RE.exec(spec.query.trim().replace(/\s+/g, ' '));
    if (!match || !match.groups) {
      throw new Error(
        `FakeCosmos: unsupported query syntax — extend the evaluator in api/test/fakes/cosmos.ts:\n${spec.query}`,
      );
    }
    const { top, select, where, orderField, orderDir, offset, limit } =
      match.groups;

    let results = Array.from(this.storage.values()).map((s) => ({ ...s.doc }));

    if (where) {
      const conditions = where.split(/\s+AND\s+/i).map((condition) => {
        const conditionMatch = /^c\.(\w+)\s*=\s*(@\w+)$/.exec(condition.trim());
        if (!conditionMatch) {
          throw new Error(
            `FakeCosmos: unsupported WHERE condition "${condition}"`,
          );
        }
        return { field: conditionMatch[1], param: conditionMatch[2] };
      });
      results = results.filter((doc) =>
        conditions.every(
          ({ field, param }) =>
            doc[field] === resolveParam(param, spec.parameters),
        ),
      );
    }

    if (orderField) {
      const direction = orderDir?.toUpperCase() === 'DESC' ? -1 : 1;
      results = [...results].sort((a, b) => {
        const aVal = a[orderField];
        const bVal = b[orderField];
        if (aVal === bVal) return 0;
        return (aVal as number) < (bVal as number) ? -direction : direction;
      });
    }

    if (top) {
      results = results.slice(0, Number(top));
    }

    if (offset && limit) {
      const offsetVal = Number(resolveParam(offset, spec.parameters));
      const limitVal = Number(resolveParam(limit, spec.parameters));
      results = results.slice(offsetVal, offsetVal + limitVal);
    }

    if (select !== '*') {
      const fields = select.split(',').map((token) => {
        const fieldMatch = /^c\.(\w+)$/.exec(token.trim());
        if (!fieldMatch) {
          throw new Error(`FakeCosmos: unsupported SELECT token "${token}"`);
        }
        return fieldMatch[1];
      });
      results = results.map((doc) => {
        const projected: Doc = { id: doc.id };
        for (const field of fields) {
          projected[field] = doc[field];
        }
        return projected;
      });
    }

    return results;
  }
}

export interface FakeCosmos {
  getContainer: (name: string) => FakeContainerImpl;
  /** Seed a container with documents, bypassing create()'s duplicate check. */
  seed: (container: string, docs: Doc[]) => void;
  /** Clear all containers back to empty and reset the call log. */
  reset: () => void;
  /** Every items.query() call made across all containers, in order. */
  calls: FakeQueryCall[];
}

export function createFakeCosmos(): FakeCosmos {
  const containers = new Map<string, Map<string, StoredDoc>>();
  const containerInstances = new Map<string, FakeContainerImpl>();
  const calls: FakeQueryCall[] = [];

  const containerStorage = (name: string): Map<string, StoredDoc> => {
    let storage = containers.get(name);
    if (!storage) {
      storage = new Map();
      containers.set(name, storage);
    }
    return storage;
  };

  // getContainer returns a stable instance per name so that vi.spyOn on a
  // previously-obtained container's .items/.item(...) methods also affects
  // the handler code under test, which calls getContainer(name) fresh on
  // every invocation.
  const getContainer = (name: string): FakeContainerImpl => {
    let instance = containerInstances.get(name);
    if (!instance) {
      instance = new FakeContainerImpl(name, containerStorage(name), calls);
      containerInstances.set(name, instance);
    }
    return instance;
  };

  return {
    getContainer,
    seed: (container: string, docs: Doc[]) => {
      const storage = containerStorage(container);
      const pkField = partitionKeyFieldFor(container);
      for (const doc of docs) {
        storage.set(doc.id, {
          doc: { ...doc, _etag: doc._etag ?? nextEtag() },
          partitionKeyValue: String(doc[pkField]),
          etag: (doc._etag as string) ?? nextEtag(),
        });
      }
    },
    reset: () => {
      // Clear each container's storage in place (rather than replacing the
      // Map instances) so already-cached FakeContainerImpl instances — and
      // any item()/items accessors a test has vi.spyOn'd — keep working
      // against the same (now-empty) storage after a reset.
      for (const storage of containers.values()) {
        storage.clear();
      }
      calls.length = 0;
    },
    calls,
  };
}
