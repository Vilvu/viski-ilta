import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readJson, makeRequest, makeContext } from '../helpers/request';

const readAllMock = vi.fn();
const containersReadAllMock = vi.fn();

vi.mock('@azure/cosmos', () => ({
  CosmosClient: vi.fn().mockImplementation(() => ({
    databases: { readAll: readAllMock },
    database: () => ({ containers: { readAll: containersReadAllMock } }),
  })),
}));

import { healthHandler } from '../../src/functions/health';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  readAllMock.mockReset();
  containersReadAllMock.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('healthHandler', () => {
  it('returns 500 with an env-check stage when COSMOS_ENDPOINT is missing', async () => {
    delete process.env.COSMOS_ENDPOINT;
    process.env.COSMOS_KEY = 'key';
    const res = await healthHandler(makeRequest(), makeContext());
    const { status, data } = readJson(res);
    expect(status).toBe(500);
    expect((data as { stage: string }).stage).toBe('env-check');
  });

  it('returns 500 with an env-check stage when COSMOS_KEY is missing', async () => {
    process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com';
    delete process.env.COSMOS_KEY;
    const res = await healthHandler(makeRequest(), makeContext());
    const { status, data } = readJson(res);
    expect(status).toBe(500);
    expect((data as { stage: string }).stage).toBe('env-check');
  });

  it('returns 200 with connected: true when Cosmos responds', async () => {
    process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com';
    process.env.COSMOS_KEY = 'key';
    readAllMock.mockReturnValue({
      fetchAll: async () => ({ resources: [{ id: 'whiskyapp' }] }),
    });
    containersReadAllMock.mockReturnValue({
      fetchAll: async () => ({
        resources: [{ id: 'events' }, { id: 'whiskeys' }],
      }),
    });

    const res = await healthHandler(makeRequest(), makeContext());
    const { status, data } = readJson(res);
    expect(status).toBe(200);
    expect((data as { cosmos: { connected: boolean } }).cosmos.connected).toBe(
      true,
    );
  });

  it('reports a cosmos-connect failure instead of throwing', async () => {
    process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com';
    process.env.COSMOS_KEY = 'key';
    readAllMock.mockReturnValue({
      fetchAll: async () => {
        throw new Error('connection refused');
      },
    });

    const res = await healthHandler(makeRequest(), makeContext());
    const { status, data } = readJson(res);
    expect(status).toBe(500);
    expect((data as { stage: string }).stage).toBe('cosmos-connect');
  });
});
