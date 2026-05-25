'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'context-bar.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'claude-usage.jsonl');

function runCli(stdin, extraEnv = {}) {
  return spawnSync('node', [BIN], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...extraEnv },
  });
}

test('cli: empty stdin → falls back to env adapter, exits 0', () => {
  const res = runCli('');
  assert.equal(res.status, 0);
  assert.ok(res.stdout.length > 0, 'should print something');
  assert.match(res.stdout, /\d+%/);
});

test('cli: empty JSON object → exits 0 with fallback output', () => {
  const res = runCli('{}');
  assert.equal(res.status, 0);
  assert.match(res.stdout, /\d+%/);
});

test('cli: realistic Claude Code payload renders bar + zone', () => {
  const payload = JSON.stringify({
    session_id: 'test',
    transcript_path: FIXTURE,
    cwd: '/tmp',
    model: { id: 'claude-opus-4-7[1m]', display_name: 'Opus' },
    cost: { total_cost_usd: 0.42 },
  });
  const res = runCli(payload);
  assert.equal(res.status, 0);
  // Latest usage: 250 + 1500 + 410000 = 411,750 → 41% of 1M → Dumb Zone
  assert.match(res.stdout, /41%/);
  assert.match(res.stdout, /Dumb Zone/);
  assert.match(res.stdout, /Opus/);
  assert.match(res.stdout, /\$0\.42/);
});

test('cli: NO_COLOR strips ANSI codes', () => {
  const payload = JSON.stringify({
    transcript_path: FIXTURE,
    model: { id: 'claude-opus-4-7[1m]' },
  });
  const res = runCli(payload, { NO_COLOR: '1' });
  assert.equal(res.status, 0);
  assert.doesNotMatch(res.stdout, /\x1b\[/);
});

test('cli: garbage stdin does not crash', () => {
  const res = runCli('this is not json at all !!!');
  assert.equal(res.status, 0);
  assert.match(res.stdout, /\d+%/);
});

test('cli: missing transcript path still exits 0', () => {
  const payload = JSON.stringify({
    transcript_path: '/no/such/path.jsonl',
    model: { id: 'claude-opus-4-7[1m]' },
  });
  const res = runCli(payload);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /0%/);
  assert.match(res.stdout, /Smart Zone/);
});

test('cli: env adapter with CONTEXT_BAR_* vars produces meter', () => {
  const res = runCli('', {
    CONTEXT_BAR_USED_TOKENS: '120000',
    CONTEXT_BAR_WINDOW_TOKENS: '200000',
    CONTEXT_BAR_MODEL_NAME: 'Custom',
    CONTEXT_BAR_COST_USD: '0.99',
  });
  assert.equal(res.status, 0);
  // 120k/200k = 60% → Dumb Zone
  assert.match(res.stdout, /60%/);
  assert.match(res.stdout, /Dumb Zone/);
  assert.match(res.stdout, /Custom/);
  assert.match(res.stdout, /\$0\.99/);
});
