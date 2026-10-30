import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  categoryForClient,
  expenseForClient,
  InputError,
  normalizeCategory,
  normalizeExpense,
  normalizeSettings,
  parseBody,
  userPartitionKey,
} from './domain.mjs';

// Production keeps the SDK client across warm invocations. Tests inject a client
// at the same command boundary without contacting AWS.
export const handler = createHandler({
  tableName: process.env.TABLE_NAME,
  documentClient: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  }),
});

export function createHandler({ documentClient, tableName }) {
  return handle;

  async function handle(event) {
    try {
      const subject = event.requestContext?.authorizer?.jwt?.claims?.sub;
      const PK = userPartitionKey(subject);
      const routeKey = event.routeKey;
      const id = decodeURIComponent(event.pathParameters?.id || '');

      switch (routeKey) {
        case 'GET /expenses':
          return ok(await listItems(PK, 'EXPENSE#', expenseForClient));
        case 'POST /expenses':
          return created(await createExpense(PK, parseBody(event.body)));
        case 'PUT /expenses/{id}':
          return ok(await updateExpense(PK, id, parseBody(event.body)));
        case 'DELETE /expenses/{id}':
          await deleteOwnedItem(PK, `EXPENSE#${requiredId(id)}`);
          return noContent();
        case 'GET /categories':
          return ok(await listItems(PK, 'CATEGORY#', categoryForClient));
        case 'POST /categories':
          return created(await createCategory(PK, parseBody(event.body)));
        case 'PUT /categories/{id}':
          return ok(await updateCategory(PK, id, parseBody(event.body)));
        case 'DELETE /categories/{id}':
          await deleteCategory(PK, requiredId(id));
          return noContent();
        case 'GET /settings':
          return ok(await getSettings(PK));
        case 'PATCH /settings':
          return ok(await saveSettings(PK, parseBody(event.body)));
        default:
          return response(404, { message: 'Route not found' });
      }
    } catch (error) {
      console.error(JSON.stringify({ name: error.name, message: error.message }));
      if (error instanceof InputError) return response(400, { message: error.message });
      if (error.name === 'ConditionalCheckFailedException') {
        return response(404, { message: 'Item not found' });
      }
      return response(500, { message: 'Unexpected server error' });
    }
  }

  async function listItems(PK, prefix, mapper) {
    const result = await documentClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': PK, ':prefix': prefix },
      ConsistentRead: true,
    }));
    return (result.Items || []).map(mapper).sort((a, b) =>
      String(b.date || b.name).localeCompare(String(a.date || a.name)),
    );
  }

  async function createExpense(PK, input) {
    const expense = normalizeExpense(input);
    await putNew(PK, `EXPENSE#${expense.id}`, { entityType: 'EXPENSE', ...expense });
    return expenseForClient(expense);
  }

  async function updateExpense(PK, id, input) {
    requiredId(id);
    const expense = normalizeExpense(input, id);
    await putExisting(PK, `EXPENSE#${id}`, { entityType: 'EXPENSE', ...expense });
    return expenseForClient(expense);
  }

  async function createCategory(PK, input) {
    const category = normalizeCategory(input);
    await putNew(PK, `CATEGORY#${category.id}`, { entityType: 'CATEGORY', ...category });
    return categoryForClient(category);
  }

  async function updateCategory(PK, id, input) {
    requiredId(id);
    const category = normalizeCategory(input, id);
    await putExisting(PK, `CATEGORY#${id}`, { entityType: 'CATEGORY', ...category });
    return categoryForClient(category);
  }

  async function deleteCategory(PK, id) {
    const expenses = await listItems(PK, 'EXPENSE#', expenseForClient);
    if (expenses.some((expense) => expense.categoryId === id)) {
      throw new InputError('Category is used by an expense and cannot be deleted');
    }
    await deleteOwnedItem(PK, `CATEGORY#${id}`);
  }

  async function getSettings(PK) {
    const result = await documentClient.send(new GetCommand({
      TableName: tableName,
      Key: { PK, SK: 'SETTINGS' },
      ConsistentRead: true,
    }));
    return result.Item
      ? normalizeSettings(result.Item)
      : { monthlySummary: false, budgetAlerts: true, dailyReminder: false, transactionNotifications: true };
  }

  async function saveSettings(PK, input) {
    const settings = normalizeSettings(input);
    await documentClient.send(new PutCommand({
      TableName: tableName,
      Item: { PK, SK: 'SETTINGS', entityType: 'SETTINGS', ...settings },
    }));
    return settings;
  }

  async function putNew(PK, SK, fields) {
    await documentClient.send(new PutCommand({
      TableName: tableName,
      Item: { PK, SK, ...fields },
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    }));
  }

  async function putExisting(PK, SK, fields) {
    await documentClient.send(new PutCommand({
      TableName: tableName,
      Item: { PK, SK, ...fields },
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
    }));
  }

  async function deleteOwnedItem(PK, SK) {
    await documentClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { PK, SK },
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
    }));
  }

  function requiredId(id) {
    if (!id || id.length > 100) throw new InputError('A valid item id is required');
    return id;
  }

  function response(statusCode, body) {
    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? '' : JSON.stringify(body),
    };
  }

  function ok(body) { return response(200, body); }
  function created(body) { return response(201, body); }
  function noContent() { return response(204); }
}
