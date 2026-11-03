// Local test harness: simulates API Gateway events and DynamoDB commands.
// It does not implement JWT signature verification or a real DynamoDB service.
import { createServer } from 'node:http';
import { createHandler } from '../../src/app.mjs';

export function memoryClient() {
  const items = new Map();
  const commands = [];
  const key = item => JSON.stringify([item.PK, item.SK]);
  const permitted = input => {
    const old = items.get(key(input.Item));
    const condition = input.ConditionExpression || '';
    if (condition.includes('OR #status')) return !old || old.status === 'FAILED';
    if (condition.startsWith('revision =')) return old?.revision === input.ExpressionAttributeValues[':revision'];
    if (condition.includes('attribute_not_exists')) return !old;
    if (condition.startsWith('attribute_exists')) return Boolean(old);
    return true;
  };
  return {
    items, commands,
    async send(command) {
      commands.push(command);
      const input = command.input;
      switch (command.constructor.name) {
        case 'ScanCommand':
          return { Items: [...items.values()].filter(item => item.PK.startsWith(input.ExpressionAttributeValues[':user'])) };
        case 'TransactWriteCommand':
          if (!input.TransactItems.every(item => item.Put && permitted(item.Put))) {
            throw Object.assign(new Error('Transaction condition failed'), { name: 'TransactionCanceledException' });
          }
          for (const item of input.TransactItems) items.set(key(item.Put.Item), structuredClone(item.Put.Item));
          return {};
        case 'QueryCommand':
          return { Items: [...items.values()].filter(item =>
            item.PK === input.ExpressionAttributeValues[':pk'] &&
            item.SK.startsWith(input.ExpressionAttributeValues[':prefix'] || '')) };
        case 'GetCommand':
          return { Item: items.get(key(input.Key)) };
        case 'PutCommand': {
          if (!permitted(input)) {
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
const testIdentities = { 'test-alice': 'alice', 'test-bob': 'bob', 'test-charlie': 'charlie' };

export async function startLocalApi({ port = 0, client = memoryClient() } = {}) {
  const handler = createHandler({ documentClient: client, tableName: 'local-test-budget', sender: 'sender@example.com',
    mailClient: { send: async () => ({ VerifiedForSendingStatus: true, MessageId: 'local-message' }) } });
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
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    const match = ['/expenses/import', '/recurring/apply-due'].includes(path) ? null : path.match(/^\/(expenses|categories|recurring)\/([^/]+)$/);
    const route = match ? `/${match[1]}/{id}` : path;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const result = await handler({
      version: '2.0', routeKey: `${request.method} ${route}`,
      pathParameters: match ? { id: match[2] } : undefined,
      body: Buffer.concat(chunks).toString() || undefined,
      queryStringParameters: Object.fromEntries(url.searchParams),
      requestContext: { authorizer: { jwt: { claims: { sub: subject, email: `${subject}@example.com`, email_verified: 'true' } } } },
    });
    response.writeHead(result.statusCode, { ...headers, ...result.headers }).end(result.body);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}`, client,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
