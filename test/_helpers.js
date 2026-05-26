'use strict';

// Shared test helpers. Importing this file installs a single process-exit
// hook that removes every tmpdir handed out by tmpDir(), so individual
// tests don't have to track their own cleanup.

const fs = require('fs');
const os = require('os');
const path = require('path');

const createdDirs = [];

let hookInstalled = false;
function ensureCleanupHook() {
  if (hookInstalled) return;
  hookInstalled = true;
  const cleanup = () => {
    for (const dir of createdDirs.splice(0)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); }
      catch { /* best effort */ }
    }
  };
  process.on('exit', cleanup);
}

// Create a tmpdir under os.tmpdir() and register it for cleanup on
// process exit. The returned path is identical to what mkdtempSync
// would have produced, so callers can drop this in as a replacement.
function tmpDir(prefix = 'cb-test-') {
  ensureCleanupHook();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

module.exports = { tmpDir };
