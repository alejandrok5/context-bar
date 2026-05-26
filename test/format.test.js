'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTokens, formatCost } = require('../src/format');

test('formatTokens: small numbers stay raw', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(1), '1');
  assert.equal(formatTokens(999), '999');
});

test('formatTokens: thousands use k', () => {
  assert.equal(formatTokens(1_000), '1k');
  assert.equal(formatTokens(48_000), '48k');
  assert.equal(formatTokens(412_345), '412k');
});

test('formatTokens: at least 100k drops decimal', () => {
  assert.equal(formatTokens(150_000), '150k');
  assert.equal(formatTokens(199_500), '200k');
});

test('formatTokens: millions use M', () => {
  assert.equal(formatTokens(1_000_000), '1M');
  assert.equal(formatTokens(1_234_567), '1.2M');
  assert.equal(formatTokens(10_500_000), '11M');
});

test('formatTokens: invalid input returns 0', () => {
  assert.equal(formatTokens(null), '0');
  assert.equal(formatTokens(undefined), '0');
  assert.equal(formatTokens(NaN), '0');
  assert.equal(formatTokens(-5), '0');
});

test('formatTokens: fractional values near the kilo boundary', () => {
  // Pins current behavior at the n<1000 boundary: 999.6 rounds to "1000"
  // (digits, not "1k") because the branch is chosen before rounding.
  // Slight inconsistency but documented so a future tweak knows what
  // it's changing.
  assert.equal(formatTokens(999.4), '999');
  assert.equal(formatTokens(999.6), '1000');
  assert.equal(formatTokens(1000.0), '1k');
});

test('formatCost: null/zero returns null', () => {
  assert.equal(formatCost(0), null);
  assert.equal(formatCost(null), null);
  assert.equal(formatCost(undefined), null);
});

test('formatCost: tiny values show < $0.01', () => {
  assert.equal(formatCost(0.001), '<$0.01');
  assert.equal(formatCost(0.009), '<$0.01');
});

test('formatCost: normal values formatted to 2 decimals', () => {
  assert.equal(formatCost(0.42), '$0.42');
  assert.equal(formatCost(12.5), '$12.50');
  assert.equal(formatCost(1.234), '$1.23');
});
