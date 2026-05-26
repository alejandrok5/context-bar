'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { render, pickZone, buildBar, shouldUseColor, shouldUseAscii } = require('../src/render');

test('pickZone: < 30% is green Smart Zone', () => {
  for (const pct of [0, 5, 15, 29, 29.99]) {
    const z = pickZone(pct);
    assert.equal(z.label, 'Smart Zone');
    assert.equal(z.color, 'green');
    assert.equal(z.key, 'smart');
  }
});

test('pickZone: 30-39.99% is yellow Smart Zone (approaching)', () => {
  for (const pct of [30, 35, 39, 39.99]) {
    const z = pickZone(pct);
    assert.equal(z.label, 'Smart Zone');
    assert.equal(z.color, 'yellow');
    assert.equal(z.key, 'approaching');
  }
});

test('pickZone: >= 40% is red Dumb Zone', () => {
  for (const pct of [40, 55, 99, 150]) {
    const z = pickZone(pct);
    assert.equal(z.label, 'Dumb Zone');
    assert.equal(z.color, 'red');
    assert.equal(z.key, 'dumb');
  }
});

test('buildBar: fills correct number of blocks (no color)', () => {
  assert.equal(buildBar(0, 'green', false), '[▱▱▱▱▱▱▱▱▱▱]');
  assert.equal(buildBar(45, 'yellow', false), '[▰▰▰▰▰▱▱▱▱▱]');
  assert.equal(buildBar(100, 'red', false), '[▰▰▰▰▰▰▰▰▰▰]');
});

test('buildBar: clamps overflow to 10 blocks', () => {
  assert.equal(buildBar(150, 'red', false), '[▰▰▰▰▰▰▰▰▰▰]');
});

test('buildBar: ASCII mode uses # and - glyphs', () => {
  assert.equal(buildBar(0, 'green', false, true), '[----------]');
  assert.equal(buildBar(45, 'yellow', false, true), '[#####-----]');
  assert.equal(buildBar(100, 'red', false, true), '[##########]');
});

test('shouldUseAscii: CONTEXT_BAR_ASCII enables ASCII', () => {
  assert.equal(shouldUseAscii({ CONTEXT_BAR_ASCII: '1' }), true);
  assert.equal(shouldUseAscii({ CONTEXT_BAR_ASCII: 'true' }), true);
  assert.equal(shouldUseAscii({}), false);
});

test('shouldUseAscii: non-UTF locale falls back to ASCII', () => {
  assert.equal(shouldUseAscii({ LANG: 'C' }), true);
  assert.equal(shouldUseAscii({ LANG: 'POSIX' }), true);
  assert.equal(shouldUseAscii({ LC_ALL: 'en_US.ISO-8859-1' }), true);
});

test('shouldUseAscii: UTF-8 locale uses Unicode glyphs', () => {
  assert.equal(shouldUseAscii({ LANG: 'en_US.UTF-8' }), false);
  assert.equal(shouldUseAscii({ LC_CTYPE: 'C.utf8' }), false);
});

test('render: CONTEXT_BAR_ASCII produces ASCII bar', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 200_000,
    usedTokens: 100_000,
    costUsd: null,
    branch: null,
  }, { env: { NO_COLOR: '1', CONTEXT_BAR_ASCII: '1' } });
  assert.match(out, /\[#####-----\]/);
  assert.doesNotMatch(out, /▰|▱/);
});

test('buildBar: with color, contains ANSI codes', () => {
  const out = buildBar(50, 'red', true);
  assert.match(out, /\x1b\[31m/);
  assert.match(out, /\x1b\[0m/);
});

test('shouldUseColor: NO_COLOR disables color', () => {
  assert.equal(shouldUseColor({ NO_COLOR: '1' }), false);
  assert.equal(shouldUseColor({ NO_COLOR: 'true' }), false);
  assert.equal(shouldUseColor({}), true);
});

test('shouldUseColor: CONTEXT_BAR_NO_COLOR also disables', () => {
  assert.equal(shouldUseColor({ CONTEXT_BAR_NO_COLOR: '1' }), false);
});

test('render: full payload produces expected segments', () => {
  const out = render({
    modelId: 'claude-opus-4-7[1m]',
    modelDisplayName: 'Opus 4.7',
    windowSize: 1_000_000,
    usedTokens: 420_000,
    costUsd: 0.42,
    branch: 'main',
  }, { env: { NO_COLOR: '1' } });

  assert.match(out, /42%/);
  assert.match(out, /Dumb Zone/);
  assert.match(out, /Opus 4\.7/);
  assert.match(out, /420k\/1M/);
  assert.match(out, /main/);
  assert.match(out, /\$0\.42/);
});

test('render: omits null branch and cost', () => {
  const out = render({
    modelDisplayName: 'Sonnet',
    windowSize: 200_000,
    usedTokens: 20_000,
    costUsd: null,
    branch: null,
  }, { env: { NO_COLOR: '1' } });

  assert.doesNotMatch(out, /\$/);
  // branch missing → no trailing ' · main' or similar; quick sanity:
  const segs = out.split(' · ');
  assert.ok(segs.length <= 4, `expected ≤4 segments, got: ${out}`);
});

test('render: NO_COLOR strips all ANSI codes', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 1_000_000,
    usedTokens: 500_000,
    costUsd: 1.0,
    branch: 'feature/x',
  }, { env: { NO_COLOR: '1' } });

  assert.doesNotMatch(out, /\x1b\[/);
});

test('render: with color, output contains ANSI codes', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 1_000_000,
    usedTokens: 100_000,
    costUsd: null,
    branch: null,
  }, { env: {} });

  assert.match(out, /\x1b\[32m/); // green for 10%
});

test('render: zero used tokens still renders without crashing', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 1_000_000,
    usedTokens: 0,
    costUsd: null,
    branch: null,
  }, { env: { NO_COLOR: '1' } });

  assert.match(out, /0%/);
  assert.match(out, /Smart Zone/);
});

test('render: defaults to 200k window if windowSize missing', () => {
  const out = render({
    modelDisplayName: 'Foo',
    windowSize: 0,
    usedTokens: 100_000,
    costUsd: null,
    branch: null,
  }, { env: { NO_COLOR: '1' } });

  // 100k / 200k = 50%
  assert.match(out, /50%/);
});
