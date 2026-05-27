'use strict';

// `context-bart install <host>` dispatcher and shared helpers.
//
// Each host installer is a function `({ argv, env, platform, log, dryRun })
// → { ok, exitCode }`. The dispatcher parses argv, normalizes the host
// alias, and hands off. Shared helpers below cover the parts every
// file-based installer needs: resolve the absolute command to record,
// safely read+merge an existing JSON config, and back up + atomically
// rewrite it.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Lazy-loaded so the per-host modules can `require('./index')` for the
// shared helpers without tripping a circular-require ordering bug.
const HOST_NAMES = ['claude', 'opencode', 'codex'];
const HOST_LOADERS = {
  claude: () => require('./claude-code'),
  'claude-code': () => require('./claude-code'),
  cc: () => require('./claude-code'),
  opencode: () => require('./opencode'),
  codex: () => require('./codex'),
};

function usage() {
  return [
    'Usage:',
    '  context-bart                  read JSON from stdin, render the status bar',
    '  context-bart install <host>   wire context-bart into a host config',
    '  context-bart --help           show this message',
    '',
    `Supported hosts: ${HOST_NAMES.join(', ')}`,
    '',
    'Flags:',
    '  --dry-run    print proposed changes without writing files',
  ].join('\n');
}

// Resolve the command string we should record in the host's config.
//
// The user invoked us through one of:
//   (a) a global/npm symlink — `process.argv[1]` is e.g.
//       `/usr/local/bin/context-bart`, a symlink into `node_modules`.
//   (b) `node bin/context-bart.js install ...` from a clone.
//   (c) `npx context-bart install ...` — same shape as (a), tmp-dir bin.
//
// Case (a)/(c): the symlink IS executable directly, host can run it.
// Case (b): the script file isn't executable on its own; the host must
// run it through node — and Claude Code in particular launches commands
// without inheriting the user's shell `PATH`, so we record an absolute
// node path too.
function resolveCommand(argv = process.argv) {
  const invokedAs = argv[1];
  if (!invokedAs) {
    // Pathological: no script path. Fall back to bare name + hope $PATH.
    return 'context-bart';
  }
  let real;
  try {
    real = fs.realpathSync(invokedAs);
  } catch {
    real = invokedAs;
  }
  if (real !== invokedAs) {
    // (a)/(c): invoked through a symlink — use the symlink path so the
    // host config stays readable ("/usr/local/bin/context-bart" beats a
    // node_modules path the user might prune).
    return invokedAs;
  }
  // (b): direct script invocation. Pin the node binary too so the host
  // doesn't need the user's PATH.
  return `${process.execPath} ${real}`;
}

// Read + parse a JSON config file. Distinguishes "missing" (treated as
// an empty object, fine to write to) from "exists but unparseable"
// (thrown — we refuse to clobber it).
function readJsonFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { exists: false, json: {}, raw: null };
    }
    throw err;
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const e = new Error(`refusing to overwrite ${file}: not valid JSON (${err.message})`);
    e.code = 'BART_INVALID_JSON';
    throw e;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    const e = new Error(`refusing to overwrite ${file}: top-level JSON is not an object`);
    e.code = 'BART_INVALID_JSON';
    throw e;
  }
  return { exists: true, json, raw };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Backup the existing file (if any) and atomically write the new JSON.
// Order matters: the rename onto `file` is the commit point — if we
// crash before it, the original is intact and the `.bak` (if we made
// one) holds the previous state.
function backupAndWrite(file, json, { existed }) {
  ensureDir(path.dirname(file));
  let backup = null;
  if (existed) {
    backup = `${file}.bak`;
    fs.copyFileSync(file, backup);
  }
  const tmp = `${file}.tmp`;
  const contents = JSON.stringify(json, null, 2) + '\n';
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
  return backup;
}

function homedir(env = process.env) {
  // Prefer env so tests can inject HOME without mutating os.homedir().
  // Falls through to os.homedir() (which itself reads HOME on POSIX and
  // USERPROFILE on Windows) when env is unset.
  return env.HOME || env.USERPROFILE || os.homedir();
}

function parseArgs(argv) {
  // argv is the full process.argv. argv[0]=node, argv[1]=script,
  // argv[2]='install', argv[3]=host, argv[4..]=flags.
  const rest = argv.slice(3);
  const flags = { dryRun: false };
  const positional = [];
  for (const a of rest) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '-h' || a === '--help') flags.help = true;
    else positional.push(a);
  }
  return { host: argv[3] || null, flags, extra: positional };
}

async function install(argv = process.argv, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const stdout = opts.stdout || process.stdout;
  const stderr = opts.stderr || process.stderr;
  const log = (s) => stdout.write(s + '\n');
  const warn = (s) => stderr.write(s + '\n');

  const { host, flags } = parseArgs(argv);
  if (flags.help) {
    log(usage());
    return { ok: true, exitCode: 0 };
  }
  if (!host) {
    warn('error: missing host. Try: context-bart install <claude|opencode|codex>');
    return { ok: false, exitCode: 1 };
  }
  const loader = HOST_LOADERS[host.toLowerCase()];
  if (!loader) {
    warn(`error: unknown host "${host}". Supported: ${HOST_NAMES.join(', ')}`);
    return { ok: false, exitCode: 1 };
  }
  const installer = loader();
  const command = opts.command || resolveCommand(argv);
  try {
    return await installer({
      argv, env, platform, log, warn,
      dryRun: flags.dryRun,
      command,
      home: homedir(env),
    });
  } catch (err) {
    warn(`error: ${err && err.message ? err.message : err}`);
    return { ok: false, exitCode: 1 };
  }
}

module.exports = {
  install,
  // Exported for tests + per-host modules.
  resolveCommand,
  readJsonFile,
  backupAndWrite,
  ensureDir,
  homedir,
  parseArgs,
  usage,
  HOST_NAMES,
};
