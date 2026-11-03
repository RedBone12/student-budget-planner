import { GetCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { categoryForClient, expenseForClient } from './domain.mjs';
import { nextOccurrence, previousMonth, settlement, utcDay } from './planning.mjs';

export function createMaintenance({ documentClient: db, tableName, mailClient, sender = '', now = () => new Date() }) {
  const query = async PK => {
    const items = []; let cursor;
    do {
      const page = await db.send(new QueryCommand({ TableName: tableName, KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': PK }, ExclusiveStartKey: cursor, ConsistentRead: true }));
      items.push(...(page.Items || [])); cursor = page.LastEvaluatedKey;
    } while (cursor);
    return items;
  };
  async function applyDue(PK, today = utcDay(now())) {
    let created = 0;
    for (let rule of (await query(PK)).filter(item => item.entityType === 'RECURRING' && item.active)) {
      for (let count = 0; count < 24 && rule.nextDate <= today && (!rule.endDate || rule.nextDate <= rule.endDate); count++) {
        const expense = { PK, SK: `EXPENSE#recurring-${rule.id}-${rule.nextDate}`, entityType: 'EXPENSE',
          id: `recurring-${rule.id}-${rule.nextDate}`, categoryId: rule.categoryId, amountCents: rule.amountCents,
          date: rule.nextDate, notes: rule.notes || '', recurringId: rule.id };
        const next = { ...rule, nextDate: nextOccurrence(rule), revision: crypto.randomUUID() };
        try {
          await db.send(new TransactWriteCommand({ TransactItems: [
            { Put: { TableName: tableName, Item: expense, ConditionExpression: 'attribute_not_exists(PK)' } },
            { Put: { TableName: tableName, Item: next, ConditionExpression: 'revision = :revision', ExpressionAttributeValues: { ':revision': rule.revision } } },
          ] }));
        } catch (error) {
          if (error.name === 'TransactionCanceledException') break;
          throw error;
        }
        rule = next; created++;
      }
    }
    return { created };
  }
  async function closeMonth(PK, month, today = utcDay(now())) {
    const key = { PK, SK: `SETTLEMENT#${month}` };
    const existing = await db.send(new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }));
    if (existing.Item) return existing.Item;
    const items = await query(PK);
    const record = { ...key, entityType: 'SETTLEMENT', ...settlement(month,
      items.filter(item => item.entityType === 'EXPENSE').map(expenseForClient),
      items.filter(item => item.entityType === 'CATEGORY').map(categoryForClient), today) };
    try {
      await db.send(new PutCommand({ TableName: tableName, Item: record, ConditionExpression: 'attribute_not_exists(PK)' }));
    } catch (error) {
      if (error.name !== 'ConditionalCheckFailedException') throw error;
      return (await db.send(new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }))).Item;
    }
    return record;
  }
  async function email(PK, recipient, key, subject, text) {
    const item = { PK, SK: `MAIL#${key}`, entityType: 'MAIL', status: 'SENDING', attemptedAt: now().toISOString() };
    try {
      await db.send(new PutCommand({ TableName: tableName, Item: item,
        ConditionExpression: 'attribute_not_exists(PK) OR #status = :failed',
        ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':failed': 'FAILED' } }));
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') return;
      throw error;
    }
    let sent;
    try {
      sent = await mailClient.send(new SendEmailCommand({ FromEmailAddress: sender, Destination: { ToAddresses: [recipient] },
        Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } } }));
    } catch (error) {
      await db.send(new PutCommand({ TableName: tableName, Item: { ...item, status: 'FAILED', errorCode: error.name } }));
      throw error;
    }
    // An ambiguous failure after SES accepts a message leaves SENDING, rather
    // than automatically sending a duplicate. This is deliberately not exactly-once delivery.
    await db.send(new PutCommand({ TableName: tableName, Item: { ...item, status: 'ACCEPTED', messageId: sent.MessageId } }));
  }
  async function scheduled(event = {}) {
    const today = utcDay(event.time ? new Date(event.time) : now());
    const users = new Set(); let cursor;
    do {
      const page = await db.send(new ScanCommand({ TableName: tableName, ProjectionExpression: 'PK',
        FilterExpression: 'begins_with(PK, :user)', ExpressionAttributeValues: { ':user': 'USER#' }, ExclusiveStartKey: cursor }));
      for (const item of page.Items || []) users.add(item.PK);
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    let failed = 0;
    for (const PK of users) {
      try {
        await applyDue(PK, today);
        const monthly = today.endsWith('-01') ? await closeMonth(PK, previousMonth(today), today) : null;
        const items = await query(PK);
        const settings = items.find(item => item.SK === 'SETTINGS');
        if (!sender || !settings?.emailDeliveryEnabled || !settings.emailRecipient) continue;
        const footer = '\n\nManage or disable email delivery in Budget Planner > Settings. Calendar dates use UTC.';
        if (settings.dailyReminder) await email(PK, settings.emailRecipient, `daily-${today}`, 'Daily spending reminder', `Remember to record your expenses for ${today}.${footer}`);
        if (monthly && settings.monthlySummary) await email(PK, settings.emailRecipient, `monthly-${monthly.month}`, `Budget summary: ${monthly.month}`,
          `Budget: EUR ${(monthly.budgetCents / 100).toFixed(2)}\nSpent: EUR ${(monthly.spentCents / 100).toFixed(2)}\nTransactions: ${monthly.transactionCount}${footer}`);
        if (settings.budgetAlerts) {
          const expenses = items.filter(item => item.entityType === 'EXPENSE' && item.date.startsWith(today.slice(0, 7)));
          for (const category of items.filter(item => item.entityType === 'CATEGORY' && item.budgetCents > 0)) {
            const spent = expenses.filter(item => item.categoryId === category.id).reduce((sum, item) => sum + item.amountCents, 0);
            const level = spent >= category.budgetCents ? 100 : spent >= category.budgetCents * 0.8 ? 80 : 0;
            if (level) await email(PK, settings.emailRecipient, `budget-${today.slice(0, 7)}-${category.id}-${level}`,
              `${category.name}: budget ${level}% reached`, `Spent EUR ${(spent / 100).toFixed(2)} of EUR ${(category.budgetCents / 100).toFixed(2)} this month.${footer}`);
          }
        }
      } catch (error) { failed++; console.error(JSON.stringify({ task: 'daily-maintenance', error: error.name })); }
    }
    if (failed) throw new Error(`Maintenance failed for ${failed} account(s); retry required`);
    return { accounts: users.size, date: today };
  }
  return { query, applyDue, closeMonth, scheduled };
}
