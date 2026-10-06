// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/** Selector prefixes for one project; `extra` covers the app shell's `app-root`. */
const selectors = (prefix, extra = []) => ({
  '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: [prefix, ...extra], style: 'camelCase' }],
  '@angular-eslint/component-selector': ['error', { type: ['element', 'attribute'], prefix: [prefix, ...extra], style: 'kebab-case' }],
});

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // House rules: OnPush + signals everywhere, and browser globals only behind DI tokens.
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-standalone': 'error',
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage', 'sessionStorage', 'location'],
      // The codebase models shapes with `type`, not `interface`.
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
  // Dev-only code may touch globals directly.
  {
    files: ['**/*.spec.ts', '**/*.stories.ts', '**/.storybook/**', '**/src/app/preview/**', '**/e2e/**'],
    rules: { 'no-restricted-globals': 'off' },
  },
  // Specs stub browser APIs (ResizeObserver and the like) with empty methods.
  { files: ['**/*.spec.ts'], rules: { '@typescript-eslint/no-empty-function': 'off' } },
]);

module.exports.selectors = selectors;
