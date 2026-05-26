'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { findLatestUsageTokens, sumUsage } = require('../src/transcript');

const FIXTURES = path.join(__dirname, 'fixtures');

test('sumUsage: sums all three input fields', () => {
  assert.equal(sumUsage({
    input_tokens: 10,
    cache_creation_input_tokens: 100,
    cache_read_input_tokens: 1000,
    output_tokens: 999,  // ignored
  }), 1110);
});

test('sumUsage: missing fields default to 0', () => {
  assert.equal(sumUsage({ input_tokens: 50 }), 50);
  assert.equal(sumUsage({}), 0);
  assert.equal(sumUsage(null), 0);
  assert.equal(sumUsage(undefined), 0);
});

test('findLatestUsageTokens: returns most recent assistant usage', () => {
  const fixturePath = path.join(FIXTURES, 'claude-usage.jsonl');
  const tokens = findLatestUsageTokens(fixturePath);
  // Latest line: 250 + 1500 + 410000 = 411750
  assert.equal(tokens, 411_750);
});

test('findLatestUsageTokens: walks back over lines without usage', () => {
  // Write a tmp file where the last line lacks usage but an earlier line has it.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-'));
  const p = path.join(tmpDir, 'transcript.jsonl');
  const lines = [
    '{"type":"user","message":{"role":"user","content":"a"}}',
    '{"type":"assistant","message":{"usage":{"input_tokens":100,"cache_read_input_tokens":900}}}',
    '{"type":"tool_result","content":"ok"}',
    '{"type":"user","message":{"role":"user","content":"b"}}',
  ];
  fs.writeFileSync(p, lines.join('\n') + '\n');
  assert.equal(findLatestUsageTokens(p), 1000);
});

test('findLatestUsageTokens: skips malformed JSON lines', () => {
  const fixturePath = path.join(FIXTURES, 'malformed.jsonl');
  // The latest valid usage line: 100 + 200 + 500 = 800
  assert.equal(findLatestUsageTokens(fixturePath), 800);
});

test('findLatestUsageTokens: empty file returns null (no reading available)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-'));
  const p = path.join(tmpDir, 'empty.jsonl');
  fs.writeFileSync(p, '');
  assert.equal(findLatestUsageTokens(p), null);
});

test('findLatestUsageTokens: nonexistent path returns null', () => {
  assert.equal(findLatestUsageTokens('/no/such/file.jsonl'), null);
});

test('findLatestUsageTokens: missing path returns null', () => {
  assert.equal(findLatestUsageTokens(null), null);
  assert.equal(findLatestUsageTokens(undefined), null);
  assert.equal(findLatestUsageTokens(''), null);
});

test('findLatestUsageTokens: file with no usage anywhere returns null', () => {
  const fixturePath = path.join(FIXTURES, 'no-usage.jsonl');
  assert.equal(findLatestUsageTokens(fixturePath), null);
});

test('findLatestUsageTokens: compact_boundary with no post-compact usage returns 0', () => {
  // Regression: after /compact, the OLD pre-compact usage block must not
  // be returned. Bar should show 0% (Smart Zone) until the next turn
  // writes a fresh usage block.
  const fixturePath = path.join(FIXTURES, 'post-compact-no-usage.jsonl');
  assert.equal(findLatestUsageTokens(fixturePath), 0);
});

test('findLatestUsageTokens: usage AFTER compact_boundary is honored', () => {
  // Once a fresh post-compact assistant turn exists, use its usage.
  const fixturePath = path.join(FIXTURES, 'post-compact-with-usage.jsonl');
  // 50 + 35000 + 0 = 35050
  assert.equal(findLatestUsageTokens(fixturePath), 35_050);
});

test('findLatestUsageTokens: finds usage in the tail of a >256KB transcript', () => {
  // Reproduce the perf-relevant case: a big file where only the LAST line
  // has a real usage block. Pad with junk lines to push the file past the
  // tail-read threshold, then make sure we still find the recent usage.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-big-'));
  const p = path.join(tmpDir, 'big.jsonl');
  const padLine = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(500) } });
  const lines = [];
  // ~500 bytes/line × 1000 lines = ~500KB of padding
  for (let i = 0; i < 1000; i++) lines.push(padLine);
  lines.push('{"type":"assistant","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":7000}}}');
  fs.writeFileSync(p, lines.join('\n') + '\n');
  assert.ok(fs.statSync(p).size > 256 * 1024, 'fixture must exceed TAIL_BYTES');
  assert.equal(findLatestUsageTokens(p), 7010);
});

test('findLatestUsageTokens: falls back to full read when tail has no usage', () => {
  // Tail is all user padding; the only usage block lives BEFORE the tail
  // window. We must still find it via the fallback full-file read.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-fallback-'));
  const p = path.join(tmpDir, 'fallback.jsonl');
  const padLine = JSON.stringify({ type: 'user', message: { content: 'y'.repeat(500) } });
  const head = ['{"type":"assistant","message":{"usage":{"input_tokens":1,"cache_read_input_tokens":4242}}}'];
  for (let i = 0; i < 1000; i++) head.push(padLine);
  fs.writeFileSync(p, head.join('\n') + '\n');
  assert.ok(fs.statSync(p).size > 256 * 1024);
  assert.equal(findLatestUsageTokens(p), 4243);
});

test('findLatestUsageTokens: stops at most-recent compact boundary, ignoring earlier ones', () => {
  // Two compactions: oldest usage 500k, then compact, then 200k, then compact, no usage after.
  const fs = require('fs');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-'));
  const p = path.join(tmpDir, 'multi-compact.jsonl');
  fs.writeFileSync(p, [
    '{"type":"assistant","message":{"usage":{"input_tokens":1,"cache_read_input_tokens":499999}}}',
    '{"type":"system","subtype":"compact_boundary","compactMetadata":{"trigger":"manual"}}',
    '{"type":"assistant","message":{"usage":{"input_tokens":1,"cache_read_input_tokens":199999}}}',
    '{"type":"system","subtype":"compact_boundary","compactMetadata":{"trigger":"auto"}}',
    '{"type":"user","message":{"content":"hi"}}',
  ].join('\n') + '\n');
  assert.equal(findLatestUsageTokens(p), 0);
});
