import { CosmosClient, Database } from '@azure/cosmos';
import { getMockContainer } from './cosmos.mock';

let database: Database | null = null;

export function getDatabase(): Database {
  if (database) return database;

  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const dbName = process.env.COSMOS_DATABASE ?? 'whiskyapp';

  if (!endpoint || !key) {
    throw new Error(
      `COSMOS_ENDPOINT and COSMOS_KEY environment variables are required. ` +
      `COSMOS_ENDPOINT=${endpoint ? 'set' : 'MISSING'}, COSMOS_KEY=${key ? 'set' : 'MISSING'}`,
    );
  }

  const client = new CosmosClient({ endpoint, key });
  database = client.database(dbName);
  return database;
}

export function getContainer(containerName: string) {
  // Use mock container if USE_COSMOS_MOCK is enabled
  if (process.env.USE_COSMOS_MOCK === 'true') {
    return getMockContainer(containerName) as any;
  }
  return getDatabase().container(containerName);
}
