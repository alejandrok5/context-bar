'use strict';

const claudeCode = require('./adapters/claude-code');
const opencode = require('./adapters/opencode');
const codex = require('./adapters/codex');
const env = require('./adapters/env');

const ADAPTERS = [claudeCode, opencode, codex, env];

function pickAdapter(stdin, environment) {
  for (const adapter of ADAPTERS) {
    if (adapter.detect(stdin, environment)) return adapter;
  }
  return env;
}

module.exports = { pickAdapter, ADAPTERS };
