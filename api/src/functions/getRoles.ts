import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../lib/cosmos';

interface RolesSourceRequest {
  identityProvider: string;
  userId: string;
  userDetails: string;
  claims: Array<{ typ: string; val: string }>;
  accessToken?: string;
}

async function getRolesHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await req.json()) as RolesSourceRequest;

    if (!body.userDetails || !body.userId) {
      console.warn('Invalid rolesSource request: missing userDetails or userId');
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: [] }),
      };
    }

    const userEmail = body.userDetails;
    const roles: string[] = ['authenticated'];

    try {
      const container = getContainer('admins');
      const { resources } = await container.items
        .query({
          query: 'SELECT * FROM c WHERE c.email = @email',
          parameters: [{ name: '@email', value: userEmail }],
        })
        .fetchAll();

      if (resources.length > 0) {
        roles.push('admin');
        console.log(`Admin role assigned to: ${userEmail}`);
      }
    } catch (cosmosError) {
      console.warn('Cosmos DB admins container query failed, skipping admin check:', cosmosError);
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles }) as any,
    };
  } catch (error) {
    console.error('Error in getRolesHandler:', error);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: ['authenticated'] }) as any,
    };
  }
}

app.http('GetRoles', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'GetRoles',
  handler: getRolesHandler,
});
