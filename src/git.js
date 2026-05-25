'use strict';

const { execSync } = require('child_process');

function getBranch(cwd) {
  if (!cwd) return null;
  try {
    const out = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 250,
      encoding: 'utf8',
    });
    const branch = (out || '').trim();
    if (!branch || branch === 'HEAD') return null;
    return branch;
  } catch {
    return null;
  }
}

module.exports = { getBranch };
