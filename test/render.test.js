'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { render, pickZone, buildBar, shouldUseColor, shouldUseAscii, readThresholds, DEFAULT_THRESHOLDS } = require('../src/render');

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

test('pickZone: custom thresholds shift the boundaries', () => {
  const thresholds = { smart: 50, dumb: 75 };
  assert.equal(pickZone(49, thresholds).color, 'green');
  assert.equal(pickZone(50, thresholds).color, 'yellow');
  assert.equal(pickZone(74, thresholds).color, 'yellow');
  assert.equal(pickZone(75, thresholds).color, 'red');
});

test('readThresholds: env overrides parsed as percentages', () => {
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_SMART: '50', CONTEXT_BAR_ZONE_DUMB: '80' }), { smart: 50, dumb: 80 });
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_SMART: '25.5', CONTEXT_BAR_ZONE_DUMB: '60' }), { smart: 25.5, dumb: 60 });
});

test('readThresholds: missing values fall back to defaults', () => {
  assert.deepEqual(readThresholds({}), DEFAULT_THRESHOLDS);
  // Only smart set, paired with default dumb=40 → smart(50) >= dumb(40)
  // is nonsensical, so the whole pair falls back to defaults.
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_SMART: '50' }), DEFAULT_THRESHOLDS);
  // smart=20 with default dumb=40 is valid.
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_SMART: '20' }), { smart: 20, dumb: 40 });
  // dumb=80 alone with default smart=30 is valid.
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_DUMB: '80' }), { smart: 30, dumb: 80 });
});

test('readThresholds: invalid values fall back to defaults', () => {
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_SMART: 'nope', CONTEXT_BAR_ZONE_DUMB: 'nope' }), DEFAULT_THRESHOLDS);
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_SMART: '-10' }), DEFAULT_THRESHOLDS);
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_SMART: '200' }), DEFAULT_THRESHOLDS);
});

test('readThresholds: smart >= dumb is rejected as nonsense', () => {
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_SMART: '60', CONTEXT_BAR_ZONE_DUMB: '50' }), DEFAULT_THRESHOLDS);
  assert.deepEqual(readThresholds({ CONTEXT_BAR_ZONE_SMART: '50', CONTEXT_BAR_ZONE_DUMB: '50' }), DEFAULT_THRESHOLDS);
});

test('render: custom thresholds via env change zone selection', () => {
  // At 35% with defaults (30/40) we'd be yellow; with 50/80 we should be green.
  const out = render({
    modelDisplayName: 'X',
    windowSize: 200_000,
    usedTokens: 70_000, // 35%
    costUsd: null,
    branch: null,
  }, { env: { NO_COLOR: '1', CONTEXT_BAR_ZONE_SMART: '50', CONTEXT_BAR_ZONE_DUMB: '80' } });
  assert.match(out, /Smart Zone/);
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

test('shouldUseColor: FORCE_COLOR=1 wins over NO_COLOR', () => {
  assert.equal(shouldUseColor({ FORCE_COLOR: '1', NO_COLOR: '1' }), true);
  assert.equal(shouldUseColor({ FORCE_COLOR: '2' }), true);
});

test('shouldUseColor: FORCE_COLOR=0 disables even without NO_COLOR', () => {
  assert.equal(shouldUseColor({ FORCE_COLOR: '0' }), false);
  assert.equal(shouldUseColor({ FORCE_COLOR: 'false' }), false);
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

test('render: fractional pct near a zone boundary stays consistent', () => {
  // 59,800 / 200,000 = 29.9%. Must render as "29%" (floored) AND stay in
  // the green Smart Zone, never "30%" alongside green text.
  const out = render({
    modelDisplayName: 'X',
    windowSize: 200_000,
    usedTokens: 59_800,
    costUsd: null,
    branch: null,
  }, { env: { NO_COLOR: '1' } });
  assert.match(out, /\b29%/);
  assert.doesNotMatch(out, /\b30%/);
  assert.match(out, /Smart Zone/);
});

test('render: NaN windowSize falls back to 200k default', () => {
  const out = render({
    modelDisplayName: 'X',
    windowSize: NaN,
    usedTokens: 100_000,
    costUsd: null,
    branch: null,
  }, { env: { NO_COLOR: '1' } });
  assert.match(out, /50%/);
  assert.match(out, /100k\/200k/);
});

test('render: negative usedTokens clamps to zero', () => {
  const out = render({
    modelDisplayName: 'X',
    windowSize: 200_000,
    usedTokens: -42_000,
    costUsd: null,
    branch: null,
  }, { env: { NO_COLOR: '1' } });
  assert.match(out, /\b0%/);
  assert.match(out, /Smart Zone/);
  assert.doesNotMatch(out, /-/); // no stray minus signs in the output
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
