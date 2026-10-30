import { createRequire } from 'node:module';
const require = createRequire(new URL('./frontend/package.json', import.meta.url));
const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
export default [
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '.aws-sam/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react },
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];
