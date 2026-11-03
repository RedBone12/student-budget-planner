import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { SESv2Client, GetEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { createInsights } from './insights.mjs';
import { createHash } from 'node:crypto';
import { createMaintenance } from './maintenance.mjs';
import { expenseKey, filterExpenses, normalizeRecurring, utcDay } from './planning.mjs';
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

export function createHandler({ documentClient, tableName, mailClient = new SESv2Client({}),
  sender = process.env.MAIL_SENDER || '', sandbox = process.env.SES_SANDBOX !== 'false', now = () => new Date(),
  modelClient = new BedrockRuntimeClient({ maxAttempts: 1 }), modelId = process.env.AI_MODEL_ID || '' }) {
  const maintenance = createMaintenance({ documentClient, tableName, mailClient, sender, now });
  const insights = createInsights({ documentClient, tableName, modelClient, modelId, now });
  return handle;

  async function handle(event) {
    if (event.source === 'aws.events' && event['detail-type'] === 'Scheduled Event') return maintenance.scheduled(event);
    try {
      const subject = event.requestContext?.authorizer?.jwt?.claims?.sub;
      const PK = userPartitionKey(subject);
      const routeKey = event.routeKey;
      const id = decodeURIComponent(event.pathParameters?.id || '');

      switch (routeKey) {
        case 'POST /insights':
          return ok(await insights(PK, await listItems(PK, 'EXPENSE#', expenseForClient), await listItems(PK, 'CATEGORY#', categoryForClient)));
        case 'GET /expenses':
          return ok(filterExpenses(await listItems(PK, 'EXPENSE#', expenseForClient), event.queryStringParameters || {}));
        case 'POST /expenses/import':
          return ok(await importExpenses(PK, parseBody(event.body)));
        case 'GET /settlements':
          return ok(await listItems(PK, 'SETTLEMENT#', publicItem));
        case 'POST /settlements':
          return ok(publicItem(await maintenance.closeMonth(PK, parseBody(event.body).month)));
        case 'GET /recurring':
          return ok(await listItems(PK, 'RECURRING#', recurringForClient));
        case 'POST /recurring':
          return created(await saveRecurring(PK, parseBody(event.body)));
        case 'PUT /recurring/{id}':
          return ok(await saveRecurring(PK, parseBody(event.body), requiredId(id)));
        case 'DELETE /recurring/{id}':
          await deleteOwnedItem(PK, `RECURRING#${requiredId(id)}`);
          return noContent();
        case 'POST /recurring/apply-due':
          return ok(await maintenance.applyDue(PK));
        case 'GET /email-status':
          return ok(await emailStatus(PK, event.requestContext.authorizer.jwt.claims));
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
          return ok(await saveSettings(PK, parseBody(event.body), event.requestContext.authorizer.jwt.claims));
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
    const items = []; let cursor;
    do {
      const result = await documentClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': PK, ':prefix': prefix },
      ConsistentRead: true,
      ExclusiveStartKey: cursor,
      }));
      items.push(...(result.Items || [])); cursor = result.LastEvaluatedKey;
    } while (cursor);
    return items.map(mapper).sort((a, b) =>
      String(b.date || b.name).localeCompare(String(a.date || a.name)),
    );
  }

  async function createExpense(PK, input) {
    const expense = normalizeExpense(input);
    await putNew(PK, `EXPENSE#${expense.id}`, { entityType: 'EXPENSE', ...expense });
    return expenseForClient(expense);
  }

  function publicItem({ PK: _pk, SK: _sk, entityType: _type, ...item }) { return item; }
  function recurringForClient(item) {
    return { ...expenseForClient(item), startDate: item.startDate, endDate: item.endDate,
      frequency: item.frequency, active: item.active, nextDate: item.nextDate };
  }
  async function requireCategory(PK, categoryId) {
    const found = await documentClient.send(new GetCommand({ TableName: tableName, Key: { PK, SK: `CATEGORY#${categoryId}` }, ConsistentRead: true }));
    if (!found.Item) throw new InputError('Select a category from your account');
  }
  async function saveRecurring(PK, input, id) {
    const rule = normalizeRecurring(input, id);
    await requireCategory(PK, rule.categoryId);
    if (id) {
      const old = await documentClient.send(new GetCommand({ TableName: tableName, Key: { PK, SK: `RECURRING#${id}` }, ConsistentRead: true }));
      if (!old.Item) throw Object.assign(new Error('Not found'), { name: 'ConditionalCheckFailedException' });
      if (old.Item.startDate !== rule.startDate || old.Item.frequency !== rule.frequency) throw new InputError('Create a new schedule to change its start date or frequency');
      rule.nextDate = old.Item.nextDate;
      try {
        await documentClient.send(new PutCommand({ TableName: tableName,
          Item: { PK, SK: `RECURRING#${id}`, ...rule, entityType: 'RECURRING' },
          ConditionExpression: 'revision = :revision', ExpressionAttributeValues: { ':revision': old.Item.revision } }));
      } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') throw new InputError('Schedule changed while saving. Reload and try again.');
        throw error;
      }
    } else await putNew(PK, `RECURRING#${rule.id}`, { ...rule, entityType: 'RECURRING' });
    return recurringForClient(rule);
  }
  async function importExpenses(PK, input) {
    if (!/^[\w-]{1,64}$/.test(input.importId || '') || !Array.isArray(input.rows) || !input.rows.length || input.rows.length > 50) {
      throw new InputError('Import requires an id and between 1 and 50 rows');
    }
    const fingerprint = createHash('sha256').update(JSON.stringify({ rows: input.rows, skipDuplicates: input.skipDuplicates !== false })).digest('hex');
    const key = { PK, SK: `IMPORT#${input.importId}` };
    const existing = await documentClient.send(new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }));
    if (existing.Item) {
      if (existing.Item.fingerprint !== fingerprint) throw new InputError('This import id was already used for a different file');
      return existing.Item.result;
    }
    const categories = new Set((await listItems(PK, 'CATEGORY#', categoryForClient)).map(item => item.id));
    const seen = new Set((await listItems(PK, 'EXPENSE#', expenseForClient)).map(expenseKey));
    let skipped = 0;
    const rows = input.rows.map((row, index) => {
      const item = normalizeExpense(row, `import-${input.importId}-${index}`);
      if (item.date > utcDay(now())) throw new InputError(`Row ${index + 1}: future dates are not allowed`);
      if (!categories.has(item.categoryId)) throw new InputError(`Row ${index + 1}: select a category from your account`);
      const key = expenseKey(expenseForClient(item));
      if (input.skipDuplicates !== false && seen.has(key)) { skipped++; return null; }
      seen.add(key); return item;
    }).filter(Boolean);
    const result = { imported: rows.length, skipped, expenses: rows.map(expenseForClient) };
    const marker = { ...key, entityType: 'IMPORT', fingerprint, result, importedAt: now().toISOString() };
    try {
      await documentClient.send(new TransactWriteCommand({ TransactItems: [
        ...rows.map(item => ({ Put: { TableName: tableName, Item: { PK, SK: `EXPENSE#${item.id}`, entityType: 'EXPENSE', ...item }, ConditionExpression: 'attribute_not_exists(PK)' } })),
        { Put: { TableName: tableName, Item: marker, ConditionExpression: 'attribute_not_exists(PK)' } },
      ] }));
    } catch (error) {
      const retry = await documentClient.send(new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }));
      if (retry.Item?.fingerprint === fingerprint) return retry.Item.result;
      throw error;
    }
    return result;
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
    if ((await listItems(PK, 'RECURRING#', recurringForClient)).some(rule => rule.categoryId === id)) {
      throw new InputError('Remove recurring schedules using this category first');
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
      : { monthlySummary: false, budgetAlerts: true, dailyReminder: false, transactionNotifications: true, emailDeliveryEnabled: false };
  }

  async function identityVerified(email) {
    if (!email) return false;
    try { return Boolean((await mailClient.send(new GetEmailIdentityCommand({ EmailIdentity: email }))).VerifiedForSendingStatus); }
    catch (error) { if (error.name === 'NotFoundException') return false; throw error; }
  }
  async function emailStatus(PK, claims) {
    const verified = typeof claims.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) && (claims.email_verified === true || claims.email_verified === 'true');
    const recipientVerified = verified && (!sandbox || await identityVerified(claims.email));
    const senderVerified = await identityVerified(sender);
    const history = (await listItems(PK, 'MAIL#', publicItem)).sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt)).slice(0, 10);
    return { configured: Boolean(sender), senderVerified, recipientVerified: Boolean(recipientVerified), sandbox,
      ready: Boolean(senderVerified && recipientVerified), history };
  }
  async function saveSettings(PK, input, claims) {
    const settings = normalizeSettings(input);
    let emailRecipient;
    if (settings.emailDeliveryEnabled) {
      if (!(await emailStatus(PK, claims)).ready) throw new InputError('Email delivery needs a verified sender and verified account email (also SES-verified in sandbox)');
      emailRecipient = claims.email;
    }
    await documentClient.send(new PutCommand({
      TableName: tableName,
      Item: { PK, SK: 'SETTINGS', entityType: 'SETTINGS', ...settings, ...(emailRecipient ? { emailRecipient } : {}) },
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
