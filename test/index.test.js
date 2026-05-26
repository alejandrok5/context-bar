'use strict';

// Direct tests for the run() orchestrator. Avoid spawning subprocesses
// (those live in cli.test.js as smoke tests) — we want fast feedback on
// the priority rules between explicit env overrides, host-provided
// fields, and transcript-derived signals.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { run } = require('../src/index');
const { tmpDir } = require('./_helpers');

// Default config keeps test output deterministic: color off (no ANSI to
// trip regex matches) and update-check off (so run() doesn't touch the
// real user's cache or spawn background npm fetches).
const QUIET_CONFIG = { color: 'never', updateCheck: false };

async function captureRun({ stdin = '{}', env = {}, config = QUIET_CONFIG } = {}) {
  const written = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  try {
    await run({ stdin, env, config });
  } finally {
    process.stdout.write = orig;
  }
  return written.join('');
}

test('run: env adapter renders from CONTEXT_BART_* with no stdin', async () => {
  const out = await captureRun({
    env: {
      CONTEXT_BART_USED_TOKENS: '60000',
      CONTEXT_BART_WINDOW_TOKENS: '200000',
      CONTEXT_BART_MODEL_NAME: 'Custom',
    },
  });
  assert.match(out, /30%/);  // 60k/200k = 30% → yellow approaching
  assert.match(out, /Custom/);
  assert.match(out, /60k\/200k/);
});

test('run: Claude payload reads transcript for usage', async () => {
  const dir = tmpDir('cb-run-');
  const transcript = path.join(dir, 't.jsonl');
  fs.writeFileSync(transcript,
    '{"type":"assistant","message":{"usage":{"input_tokens":100,"cache_creation_input_tokens":1000,"cache_read_input_tokens":50000}}}\n'
  );
  const stdin = JSON.stringify({
    transcript_path: transcript,
    model: { id: 'claude-opus-4-7', display_name: 'Opus' },
  });
  const out = await captureRun({ stdin });
  // 51,100 / 200,000 = 25%
  assert.match(out, /25%/);
  assert.match(out, /51\.1k\/200k/);
  assert.match(out, /Opus/);
});

test('run: exceeds_200k_tokens flag forces 1M window', async () => {
  const stdin = JSON.stringify({
    transcript_path: '/no/such/file.jsonl',
    model: { id: 'claude-opus-4-7' },
    exceeds_200k_tokens: true,
  });
  const out = await captureRun({ stdin });
  assert.match(out, /\/1M/);
});

test('run: config.windowTokens beats every other window signal', async () => {
  const stdin = JSON.stringify({
    transcript_path: '/no/such/file.jsonl',
    model: { id: 'claude-opus-4-7[1m]' },
    exceeds_200k_tokens: true,
  });
  const out = await captureRun({
    stdin,
    config: { ...QUIET_CONFIG, windowTokens: 400_000 },
  });
  assert.match(out, /\/400k/);
});

test('run: branch + worktree are joined into branch@worktree', async () => {
  const cp = require('child_process');
  const main = tmpDir('cb-run-main-');
  cp.execSync('git init -q -b primary', { cwd: main });
  cp.execSync('git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: main });
  const wt = path.join(path.dirname(main), `wt-${path.basename(main)}-extra`);
  cp.execSync(`git worktree add -q -b extra "${wt}"`, { cwd: main });

  const stdin = JSON.stringify({
    transcript_path: '/no/such/file.jsonl',
    cwd: wt,
    model: { id: 'claude-opus-4-7', display_name: 'Opus' },
  });
  const out = await captureRun({ stdin });
  const wtName = path.basename(wt);
  assert.ok(out.includes(`extra@${wtName}`), `expected branch@worktree in output: ${out}`);
});

test('run: missing transcript still produces a 0% bar', async () => {
  const stdin = JSON.stringify({
    transcript_path: '/no/such/file.jsonl',
    model: { id: 'claude-opus-4-7' },
  });
  const out = await captureRun({ stdin });
  assert.match(out, /\b0%/);
  assert.match(out, /Smart Zone/);
});

test('run: garbage stdin coerces to env adapter and still renders', async () => {
  const out = await captureRun({
    stdin: 'this is not json at all !!!',
    env: { CONTEXT_BART_USED_TOKENS: '10000', CONTEXT_BART_WINDOW_TOKENS: '200000' },
  });
  assert.match(out, /5%/);
});

test('run: partial.usedTokens (from opencode) takes precedence over transcript', async () => {
  // OpenCode-shaped payload carries usage in the session block; the
  // transcript path is empty so run() should use the host-provided usage
  // value directly and not try to coerce it from a transcript.
  const stdin = JSON.stringify({
    session: {
      model: { id: 'gpt-5' },
      usage: { total_tokens: 80_000, context_window: 200_000 },
    },
  });
  const out = await captureRun({ stdin });
  assert.match(out, /40%/);
  assert.match(out, /80k\/200k/);
});
