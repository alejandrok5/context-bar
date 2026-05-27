'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonFile, backupAndWrite } = require('./index');

// OpenCode's config layout drifts between versions. Probe the two
// documented locations and write to whichever already exists; if
// neither does, default to the XDG path.
function candidatePaths(home, env) {
  const xdg = env.XDG_CONFIG_HOME || path.join(home, '.config');
  return [
    path.join(xdg, 'opencode', 'config.json'),
    path.join(home, '.opencode', 'config.json'),
  ];
}

function pickTarget(home, env) {
  const paths = candidatePaths(home, env);
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0]; // default to XDG
}

// Keys we've seen across OpenCode versions. We always write the
// docs-recommended `statusline`; if a config already carries one of
// the others, leave it intact and flag it for the user.
const ALT_KEYS = ['status_line', 'statusBar'];

module.exports = async function installOpenCode({ home, env, command, log, warn, dryRun }) {
  const file = pickTarget(home, env);
  const { exists, json } = readJsonFile(file);
  json.statusline = { command };

  const conflicts = ALT_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(json, k));

  if (dryRun) {
    log(`(dry-run) would write ${file}:`);
    log(JSON.stringify(json, null, 2));
    if (exists) log(`(dry-run) would back up to ${file}.bak`);
    if (conflicts.length) {
      warn(`(dry-run) note: existing key(s) ${conflicts.map((k) => `"${k}"`).join(', ')} left in place`);
    }
    return { ok: true, exitCode: 0 };
  }

  const backup = backupAndWrite(file, json, { existed: exists });
  log(`Wrote statusline to ${file}`);
  if (backup) log(`Backed up previous file to ${backup}`);
  log('');
  log('Added:');
  log(JSON.stringify({ statusline: json.statusline }, null, 2));
  log('');
  log('Restart OpenCode to see the bar.');
  if (conflicts.length) {
    log('');
    log(`Note: your config still has ${conflicts.map((k) => `"${k}"`).join(', ')} from`);
    log('a different OpenCode version. If the bar does not appear after');
    log('restart, rename "statusline" to whichever key your version uses.');
  }
  return { ok: true, exitCode: 0 };
};
