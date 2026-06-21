import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value="MetaTrader 5"]',
          message:
            'Hardcoded "MetaTrader 5" is forbidden. Use the PLATFORM_LABEL env var (PRD §8.5).',
        },
        {
          selector: 'TemplateLiteral[quasis.0.value.cooked="MetaTrader 5"][expressions.length=0]',
          message:
            'Hardcoded "MetaTrader 5" is forbidden. Use the PLATFORM_LABEL env var (PRD §8.5).',
        },
      ],
    },
  },
  {
    files: ['src/parser/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value="MetaTrader 5"]',
          message:
            'Hardcoded "MetaTrader 5" is forbidden. Use the PLATFORM_LABEL env var (PRD §8.5).',
        },
        {
          selector: 'TemplateLiteral[quasis.0.value.cooked="MetaTrader 5"][expressions.length=0]',
          message:
            'Hardcoded "MetaTrader 5" is forbidden. Use the PLATFORM_LABEL env var (PRD §8.5).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['../db', '../db/*'], message: 'src/parser/ is a pure module — no DB (PRD §22 M2).' },
            { group: ['../telegram', '../telegram/*'], message: 'src/parser/ is a pure module — no Telegram (PRD §22 M2).' },
            { group: ['../executor', '../executor/*'], message: 'src/parser/ is a pure module — no executor (PRD §22 M2).' },
            { group: ['../util', '../util/*'], message: 'src/parser/ is a pure module — no util/logger (PRD §22 M2).' },
            { group: ['../config/env', '../config/env.js', '../config/env/*'], message: 'src/parser/ is a pure module — no env loader (PRD §22 M2).' },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  prettier,
);