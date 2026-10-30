// Local test harness: simulates API Gateway events and DynamoDB commands.
// It does not implement JWT signature verification or a real DynamoDB service.
import { createServer } from 'node:http';
import { createHandler } from '../../src/app.mjs';

export function memoryClient() {
  const items = new Map();
  const commands = [];
  return {
    items, commands,
    async send(command) {
      commands.push(command);
      const input = command.input;
      const key = item => JSON.stringify([item.PK, item.SK]);
      switch (command.constructor.name) {
        case 'QueryCommand':
          return { Items: [...items.values()].filter(item =>
            item.PK === input.ExpressionAttributeValues[':pk'] &&
            item.SK.startsWith(input.ExpressionAttributeValues[':prefix'])) };
        case 'GetCommand':
          return { Item: items.get(key(input.Key)) };
        case 'PutCommand': {
          const exists = items.has(key(input.Item));
          const condition = input.ConditionExpression || '';
          if ((condition.includes('attribute_not_exists') && exists) ||
              (condition.startsWith('attribute_exists') && !exists)) {
            throw Object.assign(new Error('Condition failed'), { name: 'ConditionalCheckFailedException' });
          }
          items.set(key(input.Item), structuredClone(input.Item));
          return {};
        }
        case 'DeleteCommand':
          if (!items.delete(key(input.Key))) {
            throw Object.assign(new Error('Condition failed'), { name: 'ConditionalCheckFailedException' });
          }
          return {};
        default:
          throw new Error(`Unsupported test command: ${command.constructor.name}`);
      }
    },
  };
}

// Opaque fixture tokens map to fixed identities at the gateway boundary.
const testIdentities = { 'test-alice': 'alice', 'test-bob': 'bob' };

export async function startLocalApi({ port = 0, client = memoryClient() } = {}) {
  const handler = createHandler({ documentClient: client, tableName: 'local-test-budget' });
  const server = createServer(async (request, response) => {
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Content-Type': 'application/json',
    };
    if (request.method === 'OPTIONS') { response.writeHead(204, headers).end(); return; }
    if (request.url === '/health') { response.writeHead(200, headers).end('{}'); return; }
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    const subject = Object.hasOwn(testIdentities, token) ? testIdentities[token] : undefined;
    if (!subject) { response.writeHead(401, headers).end('{"message":"Unauthorized"}'); return; }
    const path = new URL(request.url, 'http://localhost').pathname;
    const match = path.match(/^\/(expenses|categories)\/([^/]+)$/);
    const route = match ? `/${match[1]}/{id}` : path;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const result = await handler({
      version: '2.0', routeKey: `${request.method} ${route}`,
      pathParameters: match ? { id: match[2] } : undefined,
      body: Buffer.concat(chunks).toString() || undefined,
      requestContext: { authorizer: { jwt: { claims: { sub: subject } } } },
    });
    response.writeHead(result.statusCode, { ...headers, ...result.headers }).end(result.body);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}`, client,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
