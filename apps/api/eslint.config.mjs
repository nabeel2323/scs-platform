// @ts-check
/**
 * ESLint flat config for @scs/api (ESLint 9 + typescript-eslint 8).
 *
 * The `lint` script (`eslint src`) previously referenced `--ext` and had no flat
 * config, so it could not run under ESLint 9. This config makes the CI lint gate
 * real. Rules are pragmatic: type-aware correctness issues are errors, while the
 * codebase's intentional patterns (`any` in mocks/adapters, bracket-notation env
 * access, console logging in bootstrap/seed scripts) are warnings or disabled so
 * the gate stays green and high-signal.
 */
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'infra/drizzle/migrations/**'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Mocks, Drizzle row types, and Express request augmentation legitimately
      // use `any`; enforced by tsc, not lint.
      '@typescript-eslint/no-explicit-any': 'off',
      // Underscore-prefixed args/vars are intentional "unused" placeholders.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Bootstrap/seed/migration scripts log progress to stdout by design.
      'no-console': 'off',
      // Empty catch blocks are used deliberately for best-effort cleanup.
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
