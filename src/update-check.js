'use strict';

// Zero-dependency once-a-day update notifier.
//
// Hot path: readCachedUpdate() reads a tiny JSON file synchronously and
// returns the latest version string when it's newer than the installed
// one. Must stay microseconds — the bar render budget is <50ms.
//
// Background path: maybeKickFetch() spawns a detached child to refresh
// the cache when stale. The parent does NOT wait for it; the next bar
// render picks up the new value. We isolate the network fetch into its
// own script (bin/context-bart-update-check.js) so an open socket can't
// keep the parent's event loop alive past the render.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

function isOptedOut(config = null) {
  return !!(config && config.updateCheck === false);
}

// Resolve the cache directory across platforms. We use a separate
// `platform` arg (not just process.platform) so tests can mock Windows
// behavior on a Linux CI runner.
function cacheDir(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA || env.APPDATA || os.tmpdir();
    return path.join(base, 'context-bart');
  }
  const base = env.XDG_CACHE_HOME || path.join(os.homedir() || os.tmpdir(), '.cache');
  return path.join(base, 'context-bart');
}

function cachePath(env = process.env, platform = process.platform) {
  return path.join(cacheDir(env, platform), 'latest.json');
}

// Strip pre-release / build metadata and return [major, minor, patch].
// npm's `latest` dist-tag never points at a pre-release, so we don't
// need full semver precedence rules — just numeric major/minor/patch.
function parseSemver(s) {
  if (typeof s !== 'string') return null;
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(s.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

// Read the cache file synchronously. Returns null on any failure.
// Callers should treat null as "no update info available."
function readCache(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Missing file, bad JSON, permission error — all the same to us.
  }
  return null;
}

function statMtime(file) {
  try { return fs.statSync(file).mtimeMs; }
  catch { return 0; }
}

// Public: synchronous, used in the hot render path. Returns either
//   { latest: '0.2.0' }  — show the indicator
//   null                  — nothing to show
//
// `currentVersion` is the version of context-bart that's running right
// now (read from package.json by the caller). We compare against it
// rather than against the version recorded in the cache, so an upgrade
// silently clears the notification even before the next 24h fetch.
function readCachedUpdate({ env = process.env, currentVersion, config = null } = {}) {
  if (isOptedOut(config)) return null;
  if (!currentVersion) return null;
  const file = cachePath(env);
  const cached = readCache(file);
  if (!cached || typeof cached.latest !== 'string') return null;
  if (compareSemver(cached.latest, currentVersion) <= 0) return null;
  return { latest: cached.latest };
}

// Public: synchronous trigger. If the cache is stale (or missing) and
// the user hasn't opted out, spawn a detached worker to refresh it.
// Returns true if a worker was spawned, false otherwise — exposed so
// tests can assert behavior without inspecting child processes.
function maybeKickFetch({ env = process.env, currentVersion, scriptDir, config = null } = {}) {
  if (isOptedOut(config)) return false;
  if (!currentVersion) return false;
  const file = cachePath(env);
  const age = Date.now() - statMtime(file);
  if (age < REFRESH_INTERVAL_MS) return false;

  // Ensure the cache dir exists and touch the file so concurrent
  // invocations within the next second see a fresh mtime and skip
  // spawning a duplicate fetcher. The fetcher will overwrite the
  // content; the touch only serves as a soft lock.
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const now = new Date();
    if (fs.existsSync(file)) {
      fs.utimesSync(file, now, now);
    } else {
      fs.writeFileSync(file, '{}');
    }
  } catch {
    // If we can't write the cache dir at all, silently skip — no point
    // launching a fetcher that can't persist its result.
    return false;
  }

  // Locate the fetcher relative to wherever update-check.js lives.
  // scriptDir is passed in by the caller (typically __dirname from
  // src/index.js) so we don't depend on this file's own __dirname being
  // correct across bundlers or symlinked installs.
  const dir = scriptDir || __dirname;
  const fetcher = path.resolve(dir, '..', 'bin', 'context-bart-update-check.js');

  try {
    const child = spawn(process.execPath, [fetcher, currentVersion, file], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  readCachedUpdate,
  maybeKickFetch,
  // Exported for tests:
  cacheDir,
  cachePath,
  compareSemver,
  parseSemver,
  isOptedOut,
  REFRESH_INTERVAL_MS,
};
