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
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  prettier,
);