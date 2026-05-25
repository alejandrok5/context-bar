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
  assert.equal(prettyModelName('gpt-4o-mini'), 'GPT-4o');
});

test('prettyModelName: unknown model returns stripped id', () => {
  assert.equal(prettyModelName('some-random-model'), 'some-random-model');
});

test('prettyModelName: null/empty returns null', () => {
  assert.equal(prettyModelName(null), null);
  assert.equal(prettyModelName(''), null);
});
