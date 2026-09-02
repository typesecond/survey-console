import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['test/**/*.test.ts'],
    ...vitest.configs.recommended,
  },
  {
    ignores: ['dist/**'],
  },
);
