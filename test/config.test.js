'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadConfig, configDir, configPath, EMPTY } = require('../src/config');
const { tmpDir } = require('./_helpers');

// All tests use a tmpdir as XDG_CONFIG_HOME so we never touch the real
// user config. We always call the explicit-deps form of loadConfig so
// the module-level memoization cache stays out of test state.

function envWith(dir, extra = {}) {
  // Set both POSIX (XDG_CONFIG_HOME) and Windows (APPDATA + LOCALAPPDATA)
  // env vars so configPath() lands inside the per-test tmpdir regardless
  // of which platform-resolution branch the test exercises.
  return { XDG_CONFIG_HOME: dir, APPDATA: dir, LOCALAPPDATA: dir, ...extra };
}

function writeConfig(env, contents) {
  const file = configPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return file;
}

test('configDir: respects XDG_CONFIG_HOME on linux', () => {
  const dir = '/some/config';
  assert.equal(configDir({ XDG_CONFIG_HOME: dir }, 'linux'), path.join(dir, 'context-bart'));
});

test('configDir: uses APPDATA on win32 (roaming, not local)', () => {
  const win = configDir({
    APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
  }, 'win32');
  assert.ok(win.includes('context-bart'));
  assert.ok(win.includes('Roaming'), `expected Roaming AppData, got: ${win}`);
});

test('configDir: falls back to LOCALAPPDATA on win32 when APPDATA missing', () => {
  const win = configDir({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'win32');
  assert.ok(win.includes('context-bart'));
  assert.ok(win.includes('Local'));
});

test('loadConfig: missing file returns all-nulls, no throw', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  const cfg = loadConfig({ env });
  assert.deepEqual(cfg, EMPTY);
});

test('loadConfig: malformed JSON returns all-nulls, no throw', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  writeConfig(env, 'not json {{{');
  const cfg = loadConfig({ env });
  assert.deepEqual(cfg, EMPTY);
});

test('loadConfig: top-level non-object JSON returns all-nulls', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  writeConfig(env, '"a string is not a config"');
  const cfg = loadConfig({ env });
  assert.deepEqual(cfg, EMPTY);
});

test('loadConfig: valid file parses to normalized shape', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  writeConfig(env, {
    zones: { smart: 25, dumb: 50 },
    windowTokens: 1_000_000,
    ascii: true,
    updateCheck: false,
    color: 'never',
  });
  assert.deepEqual(loadConfig({ env }), {
    zones: { smart: 25, dumb: 50 },
    windowTokens: 1_000_000,
    ascii: true,
    updateCheck: false,
    color: 'never',
  });
});

test('loadConfig: invalid zone values are individually rejected', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  // smart is invalid (>= 100), dumb is valid → whole zones pair survives
  // with smart=null. The validator drops the whole pair only when
  // smart >= dumb after both are present-and-valid; a partial pair
  // (one valid, one null) is still useful.
  writeConfig(env, { zones: { smart: 150, dumb: 80 } });
  const cfg = loadConfig({ env });
  assert.deepEqual(cfg.zones, { smart: null, dumb: 80 });
});

test('loadConfig: smart >= dumb drops the whole zones pair', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  writeConfig(env, { zones: { smart: 60, dumb: 40 } });
  assert.equal(loadConfig({ env }).zones, null);
});

test('loadConfig: bad fields do not poison neighbors', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  writeConfig(env, {
    zones: 'definitely not a zones object',
    windowTokens: -5,
    ascii: 'yes', // string, not boolean
    updateCheck: true, // valid
    color: 'rainbow',
  });
  const cfg = loadConfig({ env });
  assert.equal(cfg.zones, null);
  assert.equal(cfg.windowTokens, null);
  assert.equal(cfg.ascii, null);
  assert.equal(cfg.updateCheck, true);
  assert.equal(cfg.color, null);
});

test('loadConfig: empty object returns all-nulls (every field optional)', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  writeConfig(env, {});
  assert.deepEqual(loadConfig({ env }), EMPTY);
});

test('loadConfig: unknown fields are ignored (forward-compat)', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  writeConfig(env, { ascii: true, somethingFromTheFuture: 42 });
  const cfg = loadConfig({ env });
  assert.equal(cfg.ascii, true);
  assert.equal(cfg.somethingFromTheFuture, undefined);
});

test('loadConfig: fractional zones (e.g. 25.5%) accepted', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  writeConfig(env, { zones: { smart: 25.5, dumb: 60.5 } });
  assert.deepEqual(loadConfig({ env }).zones, { smart: 25.5, dumb: 60.5 });
});

test('loadConfig: windowTokens floors fractional values', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  writeConfig(env, { windowTokens: 1_000_000.7 });
  assert.equal(loadConfig({ env }).windowTokens, 1_000_000);
});

test('loadConfig: color accepts auto/always/never only', () => {
  const dir = tmpDir('cb-cfg-');
  const env = envWith(dir);
  for (const c of ['auto', 'always', 'never']) {
    writeConfig(env, { color: c });
    assert.equal(loadConfig({ env }).color, c);
  }
  writeConfig(env, { color: 'sometimes' });
  assert.equal(loadConfig({ env }).color, null);
});
