'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  readCachedUpdate,
  maybeKickFetch,
  cacheDir,
  cachePath,
  compareSemver,
  parseSemver,
  isOptedOut,
  REFRESH_INTERVAL_MS,
} = require('../src/update-check');
const { tmpDir } = require('./_helpers');

// All tests use a tmpdir as XDG_CACHE_HOME so we never touch the real
// user's cache, and never spawn an actual background fetcher against
// npm (maybeKickFetch is gated on a stale mtime — we set mtimes
// deliberately).

function envWith(dir, extra = {}) {
  // Set both the POSIX (XDG_CACHE_HOME) and Windows (LOCALAPPDATA) env
  // vars so cachePath() lands inside the per-test tmpdir on every
  // platform. Without LOCALAPPDATA, the Windows code path falls through
  // to the shared os.tmpdir() and earlier tests leak state into later
  // ones — the "missing cache file" assertions then fail on windows-*.
  return { XDG_CACHE_HOME: dir, LOCALAPPDATA: dir, ...extra };
}

function writeCache(env, contents) {
  const file = cachePath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return file;
}

test('parseSemver: basic + leading v + ignores pre-release', () => {
  assert.deepEqual(parseSemver('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseSemver('v0.1.10'), [0, 1, 10]);
  assert.deepEqual(parseSemver('1.0.0-beta.4'), [1, 0, 0]);
  assert.equal(parseSemver('not-a-version'), null);
  assert.equal(parseSemver(''), null);
  assert.equal(parseSemver(undefined), null);
});

test('compareSemver: numeric ordering, not lexicographic', () => {
  assert.equal(compareSemver('0.1.3', '0.1.10'), -1);
  assert.equal(compareSemver('0.2.0', '0.1.99'), 1);
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0-beta', '1.0.0'), 0); // pre-release stripped
});

test('compareSemver: unparseable inputs compare as equal (safe default)', () => {
  assert.equal(compareSemver('garbage', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0', null), 0);
});

test('isOptedOut: only config.updateCheck=false opts out', () => {
  assert.equal(isOptedOut(), false);
  assert.equal(isOptedOut(null), false);
  assert.equal(isOptedOut({}), false);
  assert.equal(isOptedOut({ updateCheck: true }), false);
  assert.equal(isOptedOut({ updateCheck: false }), true);
});

test('cacheDir: respects XDG_CACHE_HOME on linux', () => {
  const dir = '/some/cache';
  assert.equal(cacheDir({ XDG_CACHE_HOME: dir }, 'linux'), path.join(dir, 'context-bart'));
});

test('cacheDir: uses LOCALAPPDATA on win32', () => {
  const win = cacheDir({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'win32');
  // path.join normalizes separators per the host platform, so just
  // assert both halves are present.
  assert.ok(win.includes('context-bart'));
  assert.ok(win.includes('AppData'));
});

test('cacheDir: falls back to APPDATA when LOCALAPPDATA is missing on win32', () => {
  const win = cacheDir({ APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'win32');
  assert.ok(win.includes('context-bart'));
  assert.ok(win.includes('Roaming'));
});

test('readCachedUpdate: missing cache returns null', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  assert.equal(readCachedUpdate({ env, currentVersion: '0.1.3' }), null);
});

test('readCachedUpdate: malformed JSON returns null (no throw)', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  writeCache(env, 'not json at all }}}');
  assert.equal(readCachedUpdate({ env, currentVersion: '0.1.3' }), null);
});

test('readCachedUpdate: cache with newer version returns { latest }', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  writeCache(env, { latest: '0.2.0', checkedAt: Date.now() });
  assert.deepEqual(readCachedUpdate({ env, currentVersion: '0.1.3' }), { latest: '0.2.0' });
});

test('readCachedUpdate: cache with same-or-older version returns null', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  writeCache(env, { latest: '0.1.3' });
  assert.equal(readCachedUpdate({ env, currentVersion: '0.1.3' }), null);
  writeCache(env, { latest: '0.1.2' });
  assert.equal(readCachedUpdate({ env, currentVersion: '0.1.3' }), null);
});

test('readCachedUpdate: cache that omits `latest` returns null', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  writeCache(env, { checkedAt: Date.now() });
  assert.equal(readCachedUpdate({ env, currentVersion: '0.1.3' }), null);
});

test('readCachedUpdate: config opt-out short-circuits even with valid cache', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  writeCache(env, { latest: '99.99.99' });
  assert.equal(
    readCachedUpdate({ env, currentVersion: '0.1.3', config: { updateCheck: false } }),
    null,
  );
});

test('readCachedUpdate: missing currentVersion returns null', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  writeCache(env, { latest: '9.9.9' });
  assert.equal(readCachedUpdate({ env }), null);
});

test('maybeKickFetch: config opt-out skips the spawn', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  assert.equal(
    maybeKickFetch({ env, currentVersion: '0.1.3', config: { updateCheck: false } }),
    false,
  );
  assert.equal(fs.existsSync(cachePath(env)), false);
});

test('maybeKickFetch: fresh cache (within 24h) skips the spawn', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  const file = writeCache(env, { latest: '0.1.3' });
  // Touch to "now" so it's fresh.
  const now = new Date();
  fs.utimesSync(file, now, now);
  assert.equal(maybeKickFetch({ env, currentVersion: '0.1.3' }), false);
});

test('maybeKickFetch: stale cache touches mtime and spawns fetcher', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  const file = writeCache(env, { latest: '0.1.3' });
  // Force mtime older than the refresh interval.
  const stale = new Date(Date.now() - REFRESH_INTERVAL_MS - 60_000);
  fs.utimesSync(file, stale, stale);

  const before = fs.statSync(file).mtimeMs;
  const spawned = maybeKickFetch({ env, currentVersion: '0.1.3' });
  const after = fs.statSync(file).mtimeMs;

  assert.equal(spawned, true, 'should have spawned the fetcher');
  assert.ok(after > before, 'soft-lock touch should bump mtime so concurrent runs skip');
});

test('maybeKickFetch: missing cache file creates dir + spawns', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  const file = cachePath(env);
  assert.equal(fs.existsSync(file), false);

  const spawned = maybeKickFetch({ env, currentVersion: '0.1.3' });

  assert.equal(spawned, true);
  assert.equal(fs.existsSync(file), true, 'soft-lock placeholder should exist');
});

test('maybeKickFetch: missing currentVersion is a no-op', () => {
  const dir = tmpDir('cb-upd-');
  const env = envWith(dir);
  assert.equal(maybeKickFetch({ env }), false);
  assert.equal(fs.existsSync(cachePath(env)), false);
});
