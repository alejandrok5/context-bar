'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pickAdapter } = require('../src/detect');

test('detect: Claude Code wins when transcript_path is present', () => {
  const adapter = pickAdapter({
    transcript_path: '/x.jsonl',
    model: { id: 'foo' },
    session: { model: { id: 'foo' } },  // opencode signal
  }, {});
  assert.equal(adapter.name, 'claude-code');
});

test('detect: OpenCode wins over Codex when both signaled (no Claude signal)', () => {
  const adapter = pickAdapter({
    session: { model: { id: 'gpt-5' } },
    codex: {},
  }, {});
  assert.equal(adapter.name, 'opencode');
});

test('detect: Codex wins when only codex signals are present', () => {
  const adapter = pickAdapter({ codex: {} }, {});
  assert.equal(adapter.name, 'codex');
});

test('detect: env is the last-resort fallback', () => {
  const adapter = pickAdapter({}, {});
  assert.equal(adapter.name, 'env');
});

test('detect: env wins when stdin and other adapters all return false', () => {
  const adapter = pickAdapter(null, {});
  assert.equal(adapter.name, 'env');
});
