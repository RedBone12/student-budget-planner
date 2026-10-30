import test from 'node:test';
import assert from 'node:assert/strict';
import { deploy, frontendEnvironment } from './deploy.mjs';

const outputs = Object.entries({ ApiUrl: 'https://api.example/dev', UserPoolId: 'eu-west-1_test',
  UserPoolClientId: 'public-client', FrontendBucketName: 'test-frontend',
  FrontendDistributionId: 'TESTDIST', WebsiteUrl: 'https://web.example' })
  .map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }));
const settings = { AWS_ARTIFACT_BUCKET: 'test-artifacts', AWS_CLOUDFORMATION_ROLE_ARN: 'arn:aws:iam::123456789012:role/test',
  AWS_REGION: 'eu-west-1', DEPLOY_SHA: 'a'.repeat(40) };

function harness(failUpload = false) {
  const calls = [];
  return { calls, runCommand(command, args, options) {
    calls.push({ command, args, options });
    if (args.includes('describe-stacks')) return JSON.stringify({ Stacks: [{ Outputs: outputs }] });
    if (args.includes('create-invalidation')) return JSON.stringify({ Invalidation: { Id: 'invalidation-1' } });
    if (failUpload && args[0] === 's3' && args[1] === 'sync') throw new Error('Upload failed');
  } };
}

test('deployment builds from stack outputs and uploads assets before index and invalidation', async () => {
  const { calls, runCommand } = harness();
  let checked;
  await deploy({ settings, runCommand, smoke: async url => { checked = url; } });
  assert.equal(calls[0].command, 'sam');
  assert.equal(calls[0].args[0], 'build');
  const sam = calls[1].args;
  assert.ok(sam.includes('--no-confirm-changeset'));
  assert.ok(sam.includes('--no-fail-on-empty-changeset'));
  assert.ok(sam.includes(settings.AWS_CLOUDFORMATION_ROLE_ARN));
  assert.ok(sam.includes('ci'));
  const build = calls.find(call => call.command === 'npm');
  assert.equal(build.options.env.VITE_API_BASE_URL, 'https://api.example/dev');
  assert.equal(build.options.env.VITE_COGNITO_USER_POOL_CLIENT_ID, 'public-client');
  const assets = calls.findIndex(call => call.args[0] === 's3' && call.args[1] === 'sync');
  const index = calls.findIndex(call => call.args[0] === 's3' && call.args[1] === 'cp');
  const invalidation = calls.findIndex(call => call.args.includes('create-invalidation'));
  assert.ok(assets < index && index < invalidation);
  assert.ok(calls.every(call => !call.args.includes('--delete')));
  assert.equal(calls.at(-1).args[1], 'wait');
  assert.equal(checked, 'https://web.example');
});

test('deployment fails closed on configuration errors before running AWS commands', async () => {
  const { calls, runCommand } = harness();
  await assert.rejects(deploy({ settings: {}, runCommand }), /Missing deployment setting/);
  await assert.rejects(deploy({ settings: { ...settings, APPLICATION_STACK: 'other' }, runCommand }), /restricted/);
  await assert.rejects(deploy({ settings: { ...settings, AWS_REGION: 'us-east-1' }, runCommand }), /region/);
  assert.equal(calls.length, 0);
});

test('a failed asset upload stops before publishing index or invalidating CloudFront', async () => {
  const { calls, runCommand } = harness(true);
  await assert.rejects(deploy({ settings, runCommand }), /Upload failed/);
  assert.ok(!calls.some(call => call.args.includes('create-invalidation') || call.args[1] === 'cp'));
});

test('missing or insecure stack outputs fail before frontend publication', () => {
  assert.throws(() => frontendEnvironment([], 'eu-west-1'), /Missing stack output/);
  const bad = outputs.map(item => item.OutputKey === 'WebsiteUrl' ? { ...item, OutputValue: 'http://web.example' } : item);
  assert.throws(() => frontendEnvironment(bad, 'eu-west-1'), /HTTPS/);
});
