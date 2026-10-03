import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'Client/**', 'Shared/**', 'Server/**', 'Tools/**', 'Tests/**', 'artifacts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
      eqeqeq: 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['packages/server/scripts/**/*.ts', 'scripts/**/*.mjs', 'packages/shared/scripts/**/*.ts', 'packages/server/src/log.ts'],
    // Browser test scripts evaluate callbacks inside the page, so browser globals are legitimate there.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-console': 'off' },
  },
);
