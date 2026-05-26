'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectWindowSize, prettyModelName } = require('../src/window');

test('detectWindowSize: [1m] suffix → 1M', () => {
  assert.equal(detectWindowSize('claude-opus-4-7[1m]'), 1_000_000);
  assert.equal(detectWindowSize('claude-sonnet-4-6[1M]'), 1_000_000);
});

test('detectWindowSize: default → 200k', () => {
  assert.equal(detectWindowSize('claude-opus-4-7'), 200_000);
  assert.equal(detectWindowSize('claude-sonnet-4-6'), 200_000);
  assert.equal(detectWindowSize('gpt-5'), 200_000);
});

test('detectWindowSize: missing model → default 200k', () => {
  assert.equal(detectWindowSize(null), 200_000);
  assert.equal(detectWindowSize(undefined), 200_000);
  assert.equal(detectWindowSize(''), 200_000);
});

test('detectWindowSize: env override wins', () => {
  assert.equal(detectWindowSize('claude-opus-4-7', '500000'), 500_000);
  assert.equal(detectWindowSize(null, '300000'), 300_000);
});

test('detectWindowSize: invalid env override is ignored', () => {
  assert.equal(detectWindowSize('claude-opus-4-7[1m]', 'foo'), 1_000_000);
  assert.equal(detectWindowSize('claude-opus-4-7', '0'), 200_000);
  assert.equal(detectWindowSize('claude-opus-4-7', '-100'), 200_000);
});

test('detectWindowSize: usedTokens > 200k forces 1M window', () => {
  // The real-world bug: Claude Code passes model.id="claude-opus-4-7"
  // (no [1m] suffix) for 1M-tier models. Auto-grow when usage exceeds 200k.
  assert.equal(detectWindowSize('claude-opus-4-7', null, { usedTokens: 410_000 }), 1_000_000);
  assert.equal(detectWindowSize('claude-opus-4-7', null, { usedTokens: 200_001 }), 1_000_000);
});

test('detectWindowSize: usedTokens at or below 200k stays at 200k default', () => {
  assert.equal(detectWindowSize('claude-opus-4-7', null, { usedTokens: 199_999 }), 200_000);
  assert.equal(detectWindowSize('claude-opus-4-7', null, { usedTokens: 200_000 }), 200_000);
  assert.equal(detectWindowSize('claude-opus-4-7', null, { usedTokens: 0 }), 200_000);
});

test('detectWindowSize: exceeds200k flag forces 1M window', () => {
  assert.equal(detectWindowSize('claude-opus-4-7', null, { exceeds200k: true }), 1_000_000);
  // Even when usedTokens is small (stale flag or fresh-after-compact reading),
  // the host's explicit signal wins.
  assert.equal(detectWindowSize('claude-opus-4-7', null, { exceeds200k: true, usedTokens: 50_000 }), 1_000_000);
});

test('detectWindowSize: env override beats all auto signals', () => {
  assert.equal(
    detectWindowSize('claude-opus-4-7', '500000', { usedTokens: 800_000, exceeds200k: true }),
    500_000,
  );
});

test('detectWindowSize: [1m] suffix still wins over no signals', () => {
  assert.equal(detectWindowSize('claude-opus-4-7[1m]', null, {}), 1_000_000);
});

test('detectWindowSize: config.windowTokens used when env override is empty', () => {
  assert.equal(
    detectWindowSize('claude-opus-4-7', null, {}, { windowTokens: 750_000 }),
    750_000,
  );
});

test('detectWindowSize: env override beats config.windowTokens', () => {
  assert.equal(
    detectWindowSize('claude-opus-4-7', '500000', {}, { windowTokens: 750_000 }),
    500_000,
  );
});

test('detectWindowSize: config.windowTokens beats auto-grow heuristic', () => {
  // Even with usedTokens > 200k, an explicit user config wins.
  assert.equal(
    detectWindowSize('claude-opus-4-7', null, { usedTokens: 410_000 }, { windowTokens: 500_000 }),
    500_000,
  );
});

test('detectWindowSize: null/empty config falls through to existing logic', () => {
  assert.equal(detectWindowSize('claude-opus-4-7[1m]', null, {}, null), 1_000_000);
  assert.equal(detectWindowSize('claude-opus-4-7', null, {}, { windowTokens: null }), 200_000);
});

test('prettyModelName: prefers displayName when given', () => {
  assert.equal(prettyModelName('claude-opus-4-7[1m]', 'Opus'), 'Opus');
});

test('prettyModelName: derives Opus/Sonnet/Haiku from id', () => {
  assert.equal(prettyModelName('claude-opus-4-7[1m]'), 'Opus 4.7');
  assert.equal(prettyModelName('claude-sonnet-4-6'), 'Sonnet 4.6');
  assert.equal(prettyModelName('claude-haiku-4-5-20251001'), 'Haiku 4.5');
});

test('prettyModelName: handles GPT models', () => {
  assert.equal(prettyModelName('gpt-5'), 'GPT-5');
  assert.equal(prettyModelName('gpt-4o'), 'GPT-4o');
  assert.equal(prettyModelName('gpt-4'), 'GPT-4');
});

test('prettyModelName: preserves GPT variant suffixes', () => {
  assert.equal(prettyModelName('gpt-4o-mini'), 'GPT-4o mini');
  assert.equal(prettyModelName('gpt-4-turbo'), 'GPT-4 Turbo');
  assert.equal(prettyModelName('gpt-5-nano'), 'GPT-5 nano');
  assert.equal(prettyModelName('gpt-5-mini'), 'GPT-5 mini');
});

test('prettyModelName: unknown model returns stripped id', () => {
  assert.equal(prettyModelName('some-random-model'), 'some-random-model');
});

test('prettyModelName: null/empty returns null', () => {
  assert.equal(prettyModelName(null), null);
  assert.equal(prettyModelName(''), null);
});

test('prettyModelName: dated id with [1m] suffix still parses to family + version', () => {
  // Real Claude Code transcripts sometimes pass dated model ids like
  // claude-opus-4-7-20260101[1m]. The [1m] suffix is stripped, the date
  // tail is ignored, and the family/version pair is preserved.
  assert.equal(prettyModelName('claude-opus-4-7-20260101[1m]'), 'Opus 4.7');
  assert.equal(prettyModelName('claude-sonnet-4-6-20260315'), 'Sonnet 4.6');
});
