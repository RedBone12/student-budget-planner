import { startLocalApi } from '../../backend/tests/support/local-api.mjs';

const api = await startLocalApi({ port: 4174, modelId: 'local-fixture', modelClient: { async send(command) {
  const facts = JSON.parse(command.input.messages[0].content[0].text);
  return { output: { message: { content: [{ text: JSON.stringify({
    findings: facts.evidence.filter(item => item.kind !== 'suggestion').slice(0, 3).map(item => ({ evidenceId: item.id, explanation: 'Review this recorded spending pattern alongside the calculated evidence before deciding what to change.' })),
    suggestions: facts.evidence.filter(item => item.kind === 'suggestion').slice(0, 3).map(item => ({ evidenceId: item.id, explanation: 'Consider reviewing this limit only if it fits your circumstances.' })),
  }) }] } } };
} } });
console.log(`Local test API listening at ${api.url}`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await api.close(); process.exit(0); });
}
