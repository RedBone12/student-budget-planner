import { startLocalApi } from '../../backend/tests/support/local-api.mjs';

const api = await startLocalApi({ port: 4174 });
console.log(`Local test API listening at ${api.url}`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await api.close(); process.exit(0); });
}
