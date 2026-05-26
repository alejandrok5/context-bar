'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // The crash-safe paths intentionally swallow errors. Allow them
      // without forcing a no-op identifier.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Project style: don't ban unused vars from being prefixed with _.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['test/**/*.js'],
    rules: {
      // Tests redefine common locals inside scoped callbacks.
      'no-shadow': 'off',
      // Tests intentionally match ANSI escape codes (\x1b) in regexes.
      'no-control-regex': 'off',
    },
  },
];
