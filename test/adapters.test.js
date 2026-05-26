'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const claudeCode = require('../src/adapters/claude-code');
const opencode = require('../src/adapters/opencode');
const codex = require('../src/adapters/codex');
const env = require('../src/adapters/env');

const FIXTURES = path.join(__dirname, 'fixtures');
const CLAUDE_FIXTURE = path.join(FIXTURES, 'claude-usage.jsonl');

// -------- claude-code --------

test('claude-code: detect matches a typical statusline payload', () => {
  assert.equal(claudeCode.detect({
    transcript_path: '/some/path.jsonl',
    model: { id: 'claude-opus-4-7[1m]' },
  }), true);
});

test('claude-code: detect rejects payloads without transcript_path', () => {
  assert.equal(claudeCode.detect({ model: { id: 'foo' } }), false);
  assert.equal(claudeCode.detect({}), false);
  assert.equal(claudeCode.detect(null), false);
});

test('claude-code: parse extracts model, transcript, cost, cwd', () => {
  const out = claudeCode.parse({
    transcript_path: CLAUDE_FIXTURE,
    model: { id: 'claude-opus-4-7[1m]', display_name: 'Opus' },
    workspace: { current_dir: '/home/foo' },
    cost: { total_cost_usd: 1.23 },
    cwd: '/home/foo/project',
  });
  assert.equal(out.source, 'claude-code');
  assert.equal(out.modelId, 'claude-opus-4-7[1m]');
  assert.equal(out.modelDisplayName, 'Opus');
  assert.equal(out.transcriptPath, CLAUDE_FIXTURE);
  assert.equal(out.cwd, '/home/foo/project');
  assert.equal(out.costUsd, 1.23);
});

test('claude-code: parse handles missing cost gracefully', () => {
  const out = claudeCode.parse({
    transcript_path: CLAUDE_FIXTURE,
    model: { id: 'foo' },
  });
  assert.equal(out.costUsd, null);
});

test('claude-code: parse passes through exceeds_200k_tokens flag', () => {
  const out = claudeCode.parse({
    transcript_path: CLAUDE_FIXTURE,
    model: { id: 'claude-opus-4-7' },
    exceeds_200k_tokens: true,
  });
  assert.equal(out.exceeds200k, true);
});

test('claude-code: exceeds200k defaults to false when flag missing', () => {
  const out = claudeCode.parse({
    transcript_path: CLAUDE_FIXTURE,
    model: { id: 'claude-opus-4-7' },
  });
  assert.equal(out.exceeds200k, false);
});

// -------- opencode --------

test('opencode: detect matches session-with-model payloads', () => {
  assert.equal(opencode.detect({
    session: { model: { id: 'gpt-5' } },
  }, {}), true);
});

test('opencode: detect matches explicit provider tag', () => {
  assert.equal(opencode.detect({ provider: 'opencode' }, {}), true);
});

test('opencode: detect matches OPENCODE_SESSION env', () => {
  assert.equal(opencode.detect({}, { OPENCODE_SESSION: 'abc' }), true);
});

test('opencode: detect rejects Claude Code payloads (has transcript_path)', () => {
  assert.equal(opencode.detect({
    transcript_path: '/x.jsonl',
    session: { model: { id: 'foo' } },
  }, {}), false);
});

test('opencode: stale OPENCODE_SESSION env does not hijack a Claude payload', () => {
  // Regression: previously OPENCODE_SESSION alone returned true, which
  // would mis-route a Claude Code payload (transcript_path present) when
  // the user had a leftover export from a different shell.
  assert.equal(opencode.detect({
    transcript_path: '/x.jsonl',
    model: { id: 'claude-opus-4-7[1m]' },
  }, { OPENCODE_SESSION: 'abc' }), false);
});

test('opencode: parse extracts usage and model from session', () => {
  const out = opencode.parse({
    session: {
      model: { id: 'gpt-5', display_name: 'GPT-5' },
      usage: { total_tokens: 75_000, context_window: 200_000 },
    },
    cost: { total_usd: 0.55 },
    cwd: '/work/dir',
  }, {});
  assert.equal(out.source, 'opencode');
  assert.equal(out.modelId, 'gpt-5');
  assert.equal(out.usedTokens, 75_000);
  assert.equal(out.windowSize, 200_000);
  assert.equal(out.costUsd, 0.55);
  assert.equal(out.cwd, '/work/dir');
});

test('opencode: parse derives total_tokens from input+output if not given', () => {
  const out = opencode.parse({
    session: { model: { id: 'gpt-5' } },
    usage: { input_tokens: 30_000, output_tokens: 5_000 },
  }, {});
  assert.equal(out.usedTokens, 35_000);
});

// -------- codex --------

test('codex: detect matches CODEX_SESSION_ID env', () => {
  assert.equal(codex.detect({}, { CODEX_SESSION_ID: 'abc' }), true);
});

test('codex: detect matches codex-nested payload', () => {
  assert.equal(codex.detect({ codex: {} }, {}), true);
});

test('codex: detect matches provider tag', () => {
  assert.equal(codex.detect({ provider: 'codex' }, {}), true);
});

test('codex: detect rejects bare payloads', () => {
  assert.equal(codex.detect({}, {}), false);
  assert.equal(codex.detect(null, {}), false);
});

test('codex: parse reads model and tokens from env when stdin is empty', () => {
  const out = codex.parse({}, {
    CODEX_MODEL: 'gpt-5',
    CODEX_USED_TOKENS: '50000',
    CODEX_WINDOW_TOKENS: '200000',
    CODEX_COST_USD: '0.10',
    CODEX_CWD: '/work',
  });
  assert.equal(out.source, 'codex');
  assert.equal(out.modelId, 'gpt-5');
  assert.equal(out.usedTokens, 50_000);
  assert.equal(out.windowSize, 200_000);
  assert.equal(out.costUsd, 0.10);
  assert.equal(out.cwd, '/work');
});

test('codex: parse reads nested codex payload', () => {
  const out = codex.parse({
    codex: { model: { id: 'gpt-5' }, usage: { total_tokens: 12_345 } },
  }, {});
  assert.equal(out.modelId, 'gpt-5');
  assert.equal(out.usedTokens, 12_345);
});

// -------- env (fallback) --------

test('env: detect always matches', () => {
  assert.equal(env.detect({}, {}), true);
  assert.equal(env.detect(null, null), true);
});

test('env: parse reads CONTEXT_BART_* vars', () => {
  const out = env.parse({}, {
    CONTEXT_BART_MODEL_ID: 'custom-model',
    CONTEXT_BART_MODEL_NAME: 'Custom',
    CONTEXT_BART_USED_TOKENS: '99000',
    CONTEXT_BART_WINDOW_TOKENS: '128000',
    CONTEXT_BART_COST_USD: '0.25',
    CONTEXT_BART_CWD: '/work',
  });
  assert.equal(out.source, 'env');
  assert.equal(out.modelId, 'custom-model');
  assert.equal(out.modelDisplayName, 'Custom');
  assert.equal(out.usedTokens, 99_000);
  assert.equal(out.windowSize, 128_000);
  assert.equal(out.costUsd, 0.25);
  assert.equal(out.cwd, '/work');
});

test('env: parse with no env returns all-nulls (safe defaults)', () => {
  const out = env.parse({}, {});
  assert.equal(out.modelId, null);
  assert.equal(out.usedTokens, null);
  assert.equal(out.windowSize, null);
});
