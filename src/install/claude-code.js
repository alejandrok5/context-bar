'use strict';

const path = require('path');
const { readJsonFile, backupAndWrite } = require('./index');

// Wire context-bart into Claude Code's `~/.claude/settings.json`.
// The hand-edit equivalent is documented in docs/install-claude-code.md.

function claudeSettingsPath(home) {
  return path.join(home, '.claude', 'settings.json');
}

function buildStatusLine(command) {
  return {
    type: 'command',
    command,
    padding: 1,
  };
}

module.exports = async function installClaude({ home, command, log, dryRun }) {
  const file = claudeSettingsPath(home);
  const { exists, json } = readJsonFile(file);
  json.statusLine = buildStatusLine(command);

  if (dryRun) {
    log(`(dry-run) would write ${file}:`);
    log(JSON.stringify(json, null, 2));
    if (exists) log(`(dry-run) would back up to ${file}.bak`);
    return { ok: true, exitCode: 0 };
  }

  const backup = backupAndWrite(file, json, { existed: exists });
  log(`Wrote statusLine to ${file}`);
  if (backup) log(`Backed up previous file to ${backup}`);
  log('');
  log('Added:');
  log(JSON.stringify({ statusLine: json.statusLine }, null, 2));
  log('');
  log('Restart Claude Code to see the bar.');
  return { ok: true, exitCode: 0 };
};
