'use strict';

// End-to-end smoke tests. Pure orchestrator / formatter logic now lives
// in test/index.test.js, render.test.js, etc. — the cases here only
// guard the boundary the harness sees: process exit code, that the
// shebang and arg-less invocation work, and that hard errors don't
// take the bar down.

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
    // Opt the smoke tests out of the update notifier so we don't write
    // to the real ~/.cache or spawn detached fetchers that hit npm.
    env: { ...process.env, NO_COLOR: '1', CONTEXT_BAR_NO_UPDATE_CHECK: '1', ...extraEnv },
  });
}

test('cli smoke: empty stdin → falls back to env adapter, exits 0', () => {
  const res = runCli('');
  assert.equal(res.status, 0);
  assert.ok(res.stdout.length > 0, 'should print something');
  assert.match(res.stdout, /\d+%/);
});

test('cli smoke: realistic Claude payload renders the full bar', () => {
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

test('cli smoke: garbage stdin does not crash', () => {
  const res = runCli('this is not json at all !!!');
  assert.equal(res.status, 0);
  assert.match(res.stdout, /\d+%/);
});
