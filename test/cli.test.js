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

test('cli: model id without [1m] but usage >200k auto-detects 1M window', () => {
  // Regression: real Claude Code transcripts have model="claude-opus-4-7"
  // (no [1m] suffix) even on the 1M-context tier. usedTokens > 200k must
  // bump the window to 1M, not produce a >100% reading.
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cli-'));
  const transcript = path.join(tmp, 't.jsonl');
  fs.writeFileSync(transcript,
    '{"type":"assistant","message":{"usage":{"input_tokens":100,"cache_creation_input_tokens":1000,"cache_read_input_tokens":410000}}}\n'
  );
  const payload = JSON.stringify({
    transcript_path: transcript,
    model: { id: 'claude-opus-4-7', display_name: 'Opus 4.7' },
  });
  const res = runCli(payload);
  assert.equal(res.status, 0);
  // 411,100 / 1,000,000 = 41% (Dumb Zone). Must NOT be >100%.
  assert.match(res.stdout, /41%/);
  assert.match(res.stdout, /411k\/1M/);
  assert.doesNotMatch(res.stdout, /\b1\d\d%/);  // no >=100% reading
  assert.doesNotMatch(res.stdout, /\b2\d\d%/);
});

test('cli: /compact boundary resets the bar even if pre-compact usage exists', () => {
  // Regression: pre-compact transcripts had usage blocks before /compact;
  // the bar must NOT report those stale numbers after /compact.
  const fs = require('fs');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-compact-'));
  const transcript = path.join(tmp, 't.jsonl');
  fs.writeFileSync(transcript, [
    '{"type":"assistant","message":{"usage":{"input_tokens":250,"cache_creation_input_tokens":1500,"cache_read_input_tokens":410000}}}',
    '{"type":"system","subtype":"compact_boundary","compactMetadata":{"trigger":"manual","preTokens":68327}}',
    '{"type":"user","message":{"content":"next"}}',
  ].join('\n') + '\n');
  const payload = JSON.stringify({
    transcript_path: transcript,
    model: { id: 'claude-opus-4-7', display_name: 'Opus' },
  });
  const res = runCli(payload);
  assert.equal(res.status, 0);
  // Bar must read 0% (or near-zero), NOT the pre-compact 411k value.
  assert.match(res.stdout, /\b0%/);
  assert.match(res.stdout, /Smart Zone/);
  assert.doesNotMatch(res.stdout, /4\d\dk\//);  // no 411k or similar
});

test('cli: linked worktree shown as branch@worktree', () => {
  const fs = require('fs');
  const os = require('os');
  const cp = require('child_process');
  const main = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cli-main-'));
  cp.execSync('git init -q -b main', { cwd: main });
  cp.execSync('git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: main });
  const wt = path.join(path.dirname(main), `wt-${path.basename(main)}-feat`);
  cp.execSync(`git worktree add -q -b feat-branch "${wt}"`, { cwd: main });

  const payload = JSON.stringify({
    transcript_path: '/no/such/path.jsonl',
    cwd: wt,
    model: { id: 'claude-opus-4-7', display_name: 'Opus' },
  });
  const res = runCli(payload);
  assert.equal(res.status, 0);
  // Should show `feat-branch@<wt-basename>`
  const wtName = path.basename(wt);
  assert.match(res.stdout, new RegExp(`feat-branch@${wtName.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&')}`));
});

test('cli: main checkout shows only branch (no @worktree suffix)', () => {
  const fs = require('fs');
  const os = require('os');
  const cp = require('child_process');
  const main = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cli-solo-'));
  cp.execSync('git init -q -b solo', { cwd: main });
  cp.execSync('git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: main });

  const payload = JSON.stringify({
    transcript_path: '/no/such/path.jsonl',
    cwd: main,
    model: { id: 'claude-opus-4-7', display_name: 'Opus' },
  });
  const res = runCli(payload);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /\bsolo\b/);
  assert.doesNotMatch(res.stdout, /solo@/);
});

test('cli: exceeds_200k_tokens flag forces 1M window even with small usage', () => {
  const payload = JSON.stringify({
    transcript_path: '/no/such/path.jsonl',
    model: { id: 'claude-opus-4-7' },
    exceeds_200k_tokens: true,
  });
  const res = runCli(payload);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /\/1M/);
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
