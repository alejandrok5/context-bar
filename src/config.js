'use strict';

// User-preference loader. Reads a small JSON file at:
//   POSIX:   $XDG_CONFIG_HOME/context-bart/config.json
//            (default: ~/.config/context-bart/config.json)
//   Windows: %APPDATA%\context-bart\config.json
//            (fall back to %LOCALAPPDATA%, then os.tmpdir())
//
// Precedence in callers is always: env var > config file > built-in
// default. The loader's job is to surface the file's values in a
// normalized shape (or null per-field when unset/invalid) so callers
// can blindly do `env ?? config ?? default`.
//
// Hot path: this runs once per status-line invocation. The file is
// ~200 bytes; readFileSync + JSON.parse is well under 1ms, comfortably
// inside the <50ms render budget. We memoize the no-arg form so a
// repeated lookup in the same process doesn't re-read.

const fs = require('fs');
const os = require('os');
const path = require('path');

const EMPTY = Object.freeze({
  zones: null,
  windowTokens: null,
  ascii: null,
  updateCheck: null,
  color: null,
});

function configDir(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    // Roaming APPDATA is the conventional home for user config that
    // should follow the user across machines. LOCALAPPDATA is a fine
    // fallback when APPDATA isn't set (some stripped-down environments).
    const base = env.APPDATA || env.LOCALAPPDATA || os.tmpdir();
    return path.join(base, 'context-bart');
  }
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir() || os.tmpdir(), '.config');
  return path.join(base, 'context-bart');
}

function configPath(env = process.env, platform = process.platform) {
  return path.join(configDir(env, platform), 'config.json');
}

// Per-field validators. Each returns the normalized value, or null
// when the input is missing/invalid. We deliberately validate every
// field in isolation so a typo in one doesn't poison its neighbors.

function validZone(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n <= 0 || n >= 100) return null;
  return n;
}

function validZones(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const smart = validZone(raw.smart);
  const dumb = validZone(raw.dumb);
  // A pair where smart >= dumb is nonsensical (the bar would never
  // enter the yellow band). Reject the whole pair rather than silently
  // swapping — mirrors the env-var behavior in readThresholds().
  if (smart != null && dumb != null && smart >= dumb) return null;
  if (smart == null && dumb == null) return null;
  return { smart, dumb };
}

function validWindowTokens(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return Math.floor(n);
}

function validBoolean(b) {
  return typeof b === 'boolean' ? b : null;
}

function validColor(c) {
  if (c === 'auto' || c === 'always' || c === 'never') return c;
  return null;
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY;
  return {
    zones: validZones(raw.zones),
    windowTokens: validWindowTokens(raw.windowTokens),
    ascii: validBoolean(raw.ascii),
    updateCheck: validBoolean(raw.updateCheck),
    color: validColor(raw.color),
  };
}

function readFile(file, fsImpl) {
  try {
    const raw = fsImpl.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // Missing file, bad JSON, permission error — all the same to us:
    // fall through to defaults rather than blowing up the status line.
    return null;
  }
}

let memoized = null;

function loadConfig(opts) {
  // Hot-path shortcut: the no-arg call is what src/index.js makes once
  // per process. Memoize so repeated calls (e.g. from inside the same
  // render) don't re-stat the file.
  if (opts == null) {
    if (memoized != null) return memoized;
    memoized = normalize(readFile(configPath(), fs));
    return memoized;
  }

  // Explicit-deps form is for tests. We skip the cache so each test
  // observes the file it just wrote.
  const {
    env = process.env,
    platform = process.platform,
    fs: fsImpl = fs,
  } = opts;
  return normalize(readFile(configPath(env, platform), fsImpl));
}

// Test hook: drop the cached value so a test that mutates the real
// $XDG_CONFIG_HOME can observe its own writes via the no-arg form.
function _resetCache() {
  memoized = null;
}

module.exports = {
  loadConfig,
  configDir,
  configPath,
  EMPTY,
  _resetCache,
};
