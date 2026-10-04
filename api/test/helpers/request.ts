import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import type { ClientPrincipal } from '../../src/lib/auth';

/** Base64-encodes a principal the way Azure Static Web Apps sets the header. */
export function principalHeader(principal: ClientPrincipal): string {
  return Buffer.from(JSON.stringify(principal), 'utf-8').toString('base64');
}

/** Convenience builder for a valid ClientPrincipal with sensible defaults. */
export function makePrincipal(
  overrides: Partial<ClientPrincipal> = {},
): ClientPrincipal {
  return {
    userId: 'user1',
    userRoles: ['anonymous', 'authenticated'],
    claims: [],
    identityProvider: 'aad',
    userDetails: 'user1@example.com',
    ...overrides,
  };
}

export interface MakeRequestOptions {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  /** Raw body bytes, returned by arrayBuffer() (for image uploads). */
  rawBody?: Uint8Array;
  /** When set, adds the base64-encoded x-ms-client-principal header. */
  principal?: ClientPrincipal | null;
  /** Raw headers, merged with the principal header if both are given. */
  headers?: Record<string, string>;
}

/** Minimal HttpRequest stub covering exactly what the handlers read. */
export function makeRequest(options: MakeRequestOptions = {}): HttpRequest {
  const headerMap = new Map<string, string>(
    Object.entries(options.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );
  if (options.principal) {
    headerMap.set('x-ms-client-principal', principalHeader(options.principal));
  }
  const queryMap = new Map<string, string>(Object.entries(options.query ?? {}));

  return {
    params: options.params ?? {},
    query: {
      get: (name: string) => queryMap.get(name) ?? null,
    },
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    json: async () => options.body ?? {},
    arrayBuffer: async () => {
      const bytes = options.rawBody ?? new Uint8Array();
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
    },
  } as unknown as HttpRequest;
}

/** Minimal InvocationContext stub; handlers only receive it, never use it. */
export function makeContext(): InvocationContext {
  return {
    invocationId: 'test-invocation',
    log: () => {},
  } as unknown as InvocationContext;
}

/** Parses an HttpResponseInit body so assertions read `{ status, data }`. */
export function readJson(response: HttpResponseInit): {
  status: number | undefined;
  data: unknown;
} {
  const body =
    typeof response.body === 'string'
      ? JSON.parse(response.body)
      : response.body;
  return { status: response.status, data: body };
}
