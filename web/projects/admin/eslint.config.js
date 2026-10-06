// @ts-check
const { defineConfig } = require('eslint/config');
const rootConfig = require('../../eslint.config.js');

module.exports = defineConfig([
  ...rootConfig,
  { files: ['**/*.ts'], rules: rootConfig.selectors('admin', ['app']) },
  // Story-only host components are never shipped, so they keep Storybook's own names.
  { files: ['**/*.stories.ts'], rules: { '@angular-eslint/component-selector': 'off' } },
]);
