'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { render, pickZone, buildBar, shouldUseColor, shouldUseAscii, readThresholds, DEFAULT_THRESHOLDS } = require('../src/render');

// All preference inputs come from the config object now; env is only
// consulted for locale (LANG / LC_*) so the bar can degrade to ASCII
// on terminals that can't render Unicode.
const NO_COLOR_CFG = { color: 'never' };

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

test('readThresholds: no config returns defaults', () => {
  assert.deepEqual(readThresholds(), DEFAULT_THRESHOLDS);
  assert.deepEqual(readThresholds(null), DEFAULT_THRESHOLDS);
  assert.deepEqual(readThresholds({ zones: null }), DEFAULT_THRESHOLDS);
});

test('readThresholds: config zones are used directly', () => {
  assert.deepEqual(readThresholds({ zones: { smart: 50, dumb: 80 } }), { smart: 50, dumb: 80 });
});

test('readThresholds: partial config pairs with defaults', () => {
  // smart from config, dumb falls back to the default (40).
  assert.deepEqual(readThresholds({ zones: { smart: 20, dumb: null } }), { smart: 20, dumb: 40 });
  // dumb from config, smart falls back to the default (30).
  assert.deepEqual(readThresholds({ zones: { smart: null, dumb: 80 } }), { smart: 30, dumb: 80 });
});

test('readThresholds: smart >= dumb after merge falls back to defaults', () => {
  // config smart=50 + default dumb=40 → 50 >= 40 → drop the pair.
  assert.deepEqual(readThresholds({ zones: { smart: 50, dumb: null } }), DEFAULT_THRESHOLDS);
});

test('shouldUseColor: no config = color on', () => {
  assert.equal(shouldUseColor(), true);
  assert.equal(shouldUseColor(null), true);
  assert.equal(shouldUseColor({}), true);
});

test('shouldUseColor: config.color="never" disables', () => {
  assert.equal(shouldUseColor({ color: 'never' }), false);
});

test('shouldUseColor: config.color="auto" / "always" leave color on', () => {
  assert.equal(shouldUseColor({ color: 'auto' }), true);
  assert.equal(shouldUseColor({ color: 'always' }), true);
});

test('shouldUseAscii: config.ascii=true forces ASCII', () => {
  assert.equal(shouldUseAscii({}, { ascii: true }), true);
});

test('shouldUseAscii: no config + UTF-8 locale = Unicode', () => {
  assert.equal(shouldUseAscii({ LANG: 'en_US.UTF-8' }, null), false);
  assert.equal(shouldUseAscii({ LC_CTYPE: 'C.utf8' }, null), false);
  assert.equal(shouldUseAscii({}, null), false);
});

test('shouldUseAscii: non-UTF locale falls back to ASCII regardless of config', () => {
  // Locale detection is terminal-capability, not a user preference —
  // it always trumps a config that says "Unicode is fine".
  assert.equal(shouldUseAscii({ LANG: 'C' }, null), true);
  assert.equal(shouldUseAscii({ LANG: 'POSIX' }, { ascii: false }), true);
  assert.equal(shouldUseAscii({ LC_ALL: 'en_US.ISO-8859-1' }, null), true);
});

test('render: config thresholds shift the displayed zone', () => {
  // At 35% with defaults (30/40) we'd be yellow Smart Zone; with 50/80
  // the bar should still be green Smart Zone.
  const out = render({
    modelDisplayName: 'X',
    windowSize: 200_000,
    usedTokens: 70_000, // 35%
    costUsd: null,
    branch: null,
  }, { env: {}, config: { color: 'never', zones: { smart: 50, dumb: 80 } } });
  assert.match(out, /Smart Zone/);
  assert.doesNotMatch(out, /Dumb Zone/);
});

test('render: config.ascii=true produces ASCII bar', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 200_000,
    usedTokens: 100_000,
    costUsd: null,
    branch: null,
  }, { env: { LANG: 'en_US.UTF-8' }, config: { color: 'never', ascii: true } });
  assert.match(out, /\[#####-----\]/);
  assert.doesNotMatch(out, /▰|▱/);
});

test('buildBar: fills correct number of blocks (no color)', () => {
  assert.equal(buildBar(0, 'green', false), '[▱▱▱▱▱▱▱▱▱▱]');
  assert.equal(buildBar(45, 'yellow', false), '[▰▰▰▰▰▱▱▱▱▱]');
  assert.equal(buildBar(100, 'red', false), '[▰▰▰▰▰▰▰▰▰▰]');
});

test('buildBar: clamps overflow to 10 blocks', () => {
  assert.equal(buildBar(150, 'red', false), '[▰▰▰▰▰▰▰▰▰▰]');
});

test('buildBar: unknown color renders uncolored, never emits "undefined"', () => {
  const out = buildBar(50, 'periwinkle', true);
  assert.equal(out, '[▰▰▰▰▰▱▱▱▱▱]');
  assert.doesNotMatch(out, /undefined/);
});

test('buildBar: ASCII mode uses # and - glyphs', () => {
  assert.equal(buildBar(0, 'green', false, true), '[----------]');
  assert.equal(buildBar(45, 'yellow', false, true), '[#####-----]');
  assert.equal(buildBar(100, 'red', false, true), '[##########]');
});

test('buildBar: with color, contains ANSI codes', () => {
  const out = buildBar(50, 'red', true);
  assert.match(out, /\x1b\[31m/);
  assert.match(out, /\x1b\[0m/);
});

test('render: full payload produces expected segments', () => {
  const out = render({
    modelId: 'claude-opus-4-7[1m]',
    modelDisplayName: 'Opus 4.7',
    windowSize: 1_000_000,
    usedTokens: 420_000,
    costUsd: 0.42,
    branch: 'main',
  }, { env: {}, config: NO_COLOR_CFG });

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
  }, { env: {}, config: NO_COLOR_CFG });

  assert.doesNotMatch(out, /\$/);
  const segs = out.split(' · ');
  assert.ok(segs.length <= 4, `expected ≤4 segments, got: ${out}`);
});

test('render: config color=never strips all ANSI codes', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 1_000_000,
    usedTokens: 500_000,
    costUsd: 1.0,
    branch: 'feature/x',
  }, { env: {}, config: NO_COLOR_CFG });

  assert.doesNotMatch(out, /\x1b\[/);
});

test('render: no config = color on, output contains ANSI codes', () => {
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
  }, { env: {}, config: NO_COLOR_CFG });
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
  }, { env: {}, config: NO_COLOR_CFG });
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
  }, { env: {}, config: NO_COLOR_CFG });
  assert.match(out, /\b0%/);
  assert.match(out, /Smart Zone/);
  assert.doesNotMatch(out, /-/);
});

test('render: zero used tokens still renders without crashing', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 1_000_000,
    usedTokens: 0,
    costUsd: null,
    branch: null,
  }, { env: {}, config: NO_COLOR_CFG });

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
  }, { env: {}, config: NO_COLOR_CFG });

  assert.match(out, /50%/);
});

test('render: updateAvailable appends ↑version suffix (no color)', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 200_000,
    usedTokens: 20_000,
    costUsd: null,
    branch: null,
    updateAvailable: '0.2.1',
  }, { env: {}, config: NO_COLOR_CFG });
  assert.match(out, /↑0\.2\.1$/);
  assert.doesNotMatch(out, /\x1b\[/);
});

test('render: updateAvailable=null produces no arrow suffix', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 200_000,
    usedTokens: 20_000,
    costUsd: null,
    branch: null,
    updateAvailable: null,
  }, { env: {}, config: NO_COLOR_CFG });
  assert.doesNotMatch(out, /↑/);
  assert.doesNotMatch(out, /\^[0-9]/);
});

test('render: updateAvailable suffix is wrapped in dim ANSI when color is on', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 200_000,
    usedTokens: 20_000,
    costUsd: null,
    branch: null,
    updateAvailable: '0.2.1',
  }, { env: {} });
  assert.match(out, /\x1b\[2m↑0\.2\.1\x1b\[0m$/);
});

test('render: updateAvailable suffix uses ASCII caret in non-UTF locale', () => {
  const out = render({
    modelDisplayName: 'Opus',
    windowSize: 200_000,
    usedTokens: 20_000,
    costUsd: null,
    branch: null,
    updateAvailable: '0.2.1',
  }, { env: { LANG: 'C' }, config: NO_COLOR_CFG });
  assert.match(out, /\^0\.2\.1$/);
  assert.doesNotMatch(out, /↑/);
});
