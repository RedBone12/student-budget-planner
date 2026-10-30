import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';

// Separate serve-only configuration: normal dev/build never load auth fixtures.
export default defineConfig(({ command }) => {
  if (command !== 'serve') throw new Error('E2E fixtures cannot be built for deployment');
  return mergeConfig(base, {
    resolve: { alias: {
      'aws-amplify/auth': fileURLToPath(new URL('./e2e/fixtures/cognito.js', import.meta.url)),
    } },
    define: {
      'import.meta.env.VITE_AWS_REGION': JSON.stringify('eu-west-1'),
      'import.meta.env.VITE_COGNITO_USER_POOL_ID': JSON.stringify('eu-west-1_LocalTest'),
      'import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID': JSON.stringify('localtestclient'),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://127.0.0.1:4174'),
    },
    server: { host: '127.0.0.1', port: 4173, strictPort: true },
  });
});
