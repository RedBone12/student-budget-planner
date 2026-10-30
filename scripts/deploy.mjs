import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function frontendEnvironment(outputs, region) {
  const values = Object.fromEntries(outputs.map(item => [item.OutputKey, item.OutputValue]));
  for (const key of ['ApiUrl', 'UserPoolId', 'UserPoolClientId', 'FrontendBucketName', 'FrontendDistributionId', 'WebsiteUrl']) {
    if (typeof values[key] !== 'string' || !values[key].trim()) throw new Error(`Missing stack output: ${key}`);
  }
  if (!values.ApiUrl.startsWith('https://') || !values.WebsiteUrl.startsWith('https://')) {
    throw new Error('Stack URLs must use HTTPS');
  }
  return { values, env: {
    VITE_AWS_REGION: region,
    VITE_API_BASE_URL: values.ApiUrl,
    VITE_COGNITO_USER_POOL_ID: values.UserPoolId,
    VITE_COGNITO_USER_POOL_CLIENT_ID: values.UserPoolClientId,
  } };
}

export async function deploy({ settings = process.env, runCommand = execFileSync, smoke = smokeCheck } = {}) {
  const required = ['AWS_ARTIFACT_BUCKET', 'AWS_CLOUDFORMATION_ROLE_ARN', 'AWS_REGION', 'DEPLOY_SHA'];
  for (const key of required) if (!settings[key]) throw new Error(`Missing deployment setting: ${key}`);
  if (settings.AWS_REGION !== 'eu-west-1') throw new Error('Deployment region must be eu-west-1');
  const stack = settings.APPLICATION_STACK || 'student-budget-planner-dev';
  if (stack !== 'student-budget-planner-dev') throw new Error('This pipeline is restricted to the development stack');
  const run = (command, args, options = {}) => runCommand(command, args, { stdio: 'inherit', ...options });
  const aws = args => run('aws', [...args, '--no-cli-pager'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  run('sam', ['build', '--template-file', 'backend/template.yaml', '--build-dir', '.aws-sam/build']);
  run('sam', ['deploy', '--template-file', '.aws-sam/build/template.yaml',
    '--config-file', resolve('backend/samconfig.toml'), '--config-env', 'ci',
    '--stack-name', stack, '--region', settings.AWS_REGION,
    '--s3-bucket', settings.AWS_ARTIFACT_BUCKET, '--s3-prefix', `${stack}/sam`,
    '--role-arn', settings.AWS_CLOUDFORMATION_ROLE_ARN,
    '--capabilities', 'CAPABILITY_IAM', '--no-confirm-changeset', '--no-fail-on-empty-changeset',
    '--parameter-overrides', 'Stage=dev', 'FrontendOrigin=http://localhost:5173']);
  const description = JSON.parse(aws(['cloudformation', 'describe-stacks', '--stack-name', stack, '--output', 'json']));
  const { values, env } = frontendEnvironment(description.Stacks[0].Outputs, settings.AWS_REGION);
  run('npm', ['--prefix', 'frontend', 'run', 'build'], { env: { ...settings, ...env } });
  // Assets first, index last. Keep old hashed assets for clients with cached HTML.
  run('aws', ['s3', 'sync', 'frontend/dist', `s3://${values.FrontendBucketName}/`,
    '--exclude', 'index.html', '--cache-control', 'public,max-age=300', '--only-show-errors']);
  run('aws', ['s3', 'cp', 'frontend/dist/index.html', `s3://${values.FrontendBucketName}/index.html`,
    '--content-type', 'text/html', '--cache-control', 'no-cache,no-store,must-revalidate', '--only-show-errors']);
  const invalidation = JSON.parse(aws(['cloudfront', 'create-invalidation', '--distribution-id', values.FrontendDistributionId,
    '--paths', '/*', '--output', 'json']));
  run('aws', ['cloudfront', 'wait', 'invalidation-completed', '--distribution-id', values.FrontendDistributionId,
    '--id', invalidation.Invalidation.Id]);
  await smoke(values.WebsiteUrl);
  if (settings.GITHUB_STEP_SUMMARY) appendFileSync(settings.GITHUB_STEP_SUMMARY,
    `## Development deployed\n\nCommit: ${settings.DEPLOY_SHA}\n\nWebsite: ${values.WebsiteUrl}\n\nCloudFront invalidation completed; HTTPS smoke check passed.\n`);
}

async function smokeCheck(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !(await response.text()).includes('<div id="root">')) {
    throw new Error('Deployed website did not return the React application shell');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await deploy();
}
