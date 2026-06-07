import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

async function healthHandler(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const dbName = process.env.COSMOS_DATABASE ?? '(not set, default: whiskyapp)';

  const envCheck = {
    COSMOS_ENDPOINT: endpoint ? 'set' : 'MISSING',
    COSMOS_KEY: key ? `set (length=${key.length})` : 'MISSING',
    COSMOS_DATABASE: dbName,
    NODE_VERSION: process.version,
  };

  if (!endpoint || !key) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'error',
        stage: 'env-check',
        message: 'Required environment variables are missing',
        env: envCheck,
      }),
    };
  }

  // Try to connect to Cosmos and list databases
  try {
    const client = new CosmosClient({ endpoint, key });
    const { resources: databases } = await client.databases.readAll().fetchAll();
    const dbNames = databases.map((d) => d.id);

    let containers: string[] = [];
    try {
      const db = client.database(process.env.COSMOS_DATABASE ?? 'whiskyapp');
      const { resources: containerList } = await db.containers.readAll().fetchAll();
      containers = containerList.map((c) => c.id);
    } catch (containerErr) {
      containers = [`ERROR: ${String(containerErr)}`];
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ok',
        env: envCheck,
        cosmos: {
          connected: true,
          databases: dbNames,
          containers,
        },
      }),
    };
  } catch (err) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'error',
        stage: 'cosmos-connect',
        message: String(err),
        env: envCheck,
      }),
    };
  }
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
});
