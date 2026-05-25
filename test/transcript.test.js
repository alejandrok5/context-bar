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

test('findLatestUsageTokens: empty file returns 0', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-'));
  const p = path.join(tmpDir, 'empty.jsonl');
  fs.writeFileSync(p, '');
  assert.equal(findLatestUsageTokens(p), 0);
});

test('findLatestUsageTokens: nonexistent path returns 0', () => {
  assert.equal(findLatestUsageTokens('/no/such/file.jsonl'), 0);
});

test('findLatestUsageTokens: missing path returns 0', () => {
  assert.equal(findLatestUsageTokens(null), 0);
  assert.equal(findLatestUsageTokens(undefined), 0);
  assert.equal(findLatestUsageTokens(''), 0);
});

test('findLatestUsageTokens: file with no usage anywhere returns 0', () => {
  const fixturePath = path.join(FIXTURES, 'no-usage.jsonl');
  assert.equal(findLatestUsageTokens(fixturePath), 0);
});
