'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { tmpDir } = require('./_helpers');
const { install, resolveCommand, parseArgs } = require('../src/install');

const BIN = path.join(__dirname, '..', 'bin', 'context-bart.js');

// Capture writable used as a fake stdout/stderr. Tests assert against
// `out.text` rather than the real process streams so failures point at
// the installer output, not the test runner's buffer.
function captureWritable() {
  const chunks = [];
  return {
    write(s) { chunks.push(String(s)); return true; },
    get text() { return chunks.join(''); },
  };
}

function fakeArgv(args) {
  // argv[0]=node, argv[1]=bin path, argv[2..]=user args. The bin path
  // matters because resolveCommand() walks it; point at the real bin
  // so the recorded command is realistic.
  return ['/usr/bin/node', BIN, ...args];
}

function envFor(home, extra = {}) {
  return { HOME: home, USERPROFILE: home, ...extra };
}

async function runInstall(args, env, opts = {}) {
  const stdout = captureWritable();
  const stderr = captureWritable();
  const res = await install(fakeArgv(args), { env, stdout, stderr, ...opts });
  return { ...res, stdout, stderr };
}

// ── parseArgs / resolveCommand ────────────────────────────────────────

test('parseArgs: picks up host and --dry-run', () => {
  const out = parseArgs(fakeArgv(['install', 'claude', '--dry-run']));
  assert.equal(out.host, 'claude');
  assert.equal(out.flags.dryRun, true);
});

test('parseArgs: --help flag', () => {
  const out = parseArgs(fakeArgv(['install', '--help']));
  assert.equal(out.flags.help, true);
});

test('resolveCommand: invoked through symlink returns the symlink path', () => {
  // Build a real symlink pointing at the bin script and pass its path
  // as argv[1]. The function should return the symlink as-is.
  const dir = tmpDir('cb-resolve-');
  const link = path.join(dir, 'context-bart');
  fs.symlinkSync(BIN, link);
  const cmd = resolveCommand(['/usr/bin/node', link]);
  assert.equal(cmd, link);
});

test('resolveCommand: direct script invocation prefixes node', () => {
  const cmd = resolveCommand(['/usr/bin/node', BIN]);
  assert.ok(cmd.endsWith(`bin${path.sep}context-bart.js`) || cmd.endsWith('bin/context-bart.js'),
    `expected cmd to end with bin path, got: ${cmd}`);
  assert.ok(cmd.startsWith(process.execPath + ' '),
    `expected cmd to be prefixed with execPath, got: ${cmd}`);
});

// ── Dispatcher ────────────────────────────────────────────────────────

test('install: unknown host returns exitCode 1 with helpful stderr', async () => {
  const home = tmpDir('cb-inst-');
  const res = await runInstall(['install', 'cursor'], envFor(home));
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr.text, /unknown host "cursor"/);
  assert.match(res.stderr.text, /claude/);
});

test('install: missing host returns exitCode 1', async () => {
  const home = tmpDir('cb-inst-');
  const res = await runInstall(['install'], envFor(home));
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr.text, /missing host/);
});

test('install: --help prints usage and exits 0', async () => {
  const home = tmpDir('cb-inst-');
  const res = await runInstall(['install', '--help'], envFor(home));
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout.text, /Usage:/);
});

// ── Claude Code installer ─────────────────────────────────────────────

function readSettings(home) {
  const file = path.join(home, '.claude', 'settings.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('claude: fresh install creates settings.json with statusLine', async () => {
  const home = tmpDir('cb-inst-');
  const res = await runInstall(['install', 'claude'], envFor(home));
  assert.equal(res.exitCode, 0);
  const settings = readSettings(home);
  assert.equal(settings.statusLine.type, 'command');
  assert.equal(typeof settings.statusLine.command, 'string');
  assert.ok(settings.statusLine.command.length > 0);
  assert.equal(settings.statusLine.padding, 1);
  // No .bak when the file didn't exist before.
  assert.equal(fs.existsSync(path.join(home, '.claude', 'settings.json.bak')), false);
});

test('claude: existing config keys preserved, .bak captures original', async () => {
  const home = tmpDir('cb-inst-');
  const file = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = { permissions: { allow: ['Bash(ls)'] }, enabledPlugins: ['foo'] };
  fs.writeFileSync(file, JSON.stringify(original, null, 2));
  const originalRaw = fs.readFileSync(file, 'utf8');

  const res = await runInstall(['install', 'claude'], envFor(home));
  assert.equal(res.exitCode, 0);
  const after = readSettings(home);
  assert.deepEqual(after.permissions, original.permissions);
  assert.deepEqual(after.enabledPlugins, original.enabledPlugins);
  assert.ok(after.statusLine);
  // .bak matches the pre-write file byte-for-byte.
  const bak = fs.readFileSync(`${file}.bak`, 'utf8');
  assert.equal(bak, originalRaw);
});

test('claude: existing statusLine overwritten, .bak captures previous value', async () => {
  const home = tmpDir('cb-inst-');
  const file = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ statusLine: { type: 'command', command: '/old/path' } }));

  await runInstall(['install', 'claude'], envFor(home));
  const after = readSettings(home);
  assert.notEqual(after.statusLine.command, '/old/path');
  const bak = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
  assert.equal(bak.statusLine.command, '/old/path');
});

test('claude: re-running against own output is a no-op for content', async () => {
  const home = tmpDir('cb-inst-');
  await runInstall(['install', 'claude'], envFor(home));
  const first = readSettings(home);
  await runInstall(['install', 'claude'], envFor(home));
  const second = readSettings(home);
  assert.deepEqual(first, second);
});

test('claude: refuses to clobber invalid JSON', async () => {
  const home = tmpDir('cb-inst-');
  const file = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ not json');

  const res = await runInstall(['install', 'claude'], envFor(home));
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr.text, /not valid JSON/);
  // Original file untouched, no .bak created.
  assert.equal(fs.readFileSync(file, 'utf8'), '{ not json');
  assert.equal(fs.existsSync(`${file}.bak`), false);
});

test('claude: --dry-run does not touch the filesystem', async () => {
  const home = tmpDir('cb-inst-');
  const res = await runInstall(['install', 'claude', '--dry-run'], envFor(home));
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout.text, /dry-run/);
  assert.match(res.stdout.text, /"statusLine"/);
  assert.equal(fs.existsSync(path.join(home, '.claude', 'settings.json')), false);
});

// ── OpenCode installer ────────────────────────────────────────────────

test('opencode: fresh install writes to XDG path by default', async () => {
  const home = tmpDir('cb-inst-');
  const xdg = path.join(home, '.config');
  const res = await runInstall(['install', 'opencode'], envFor(home, { XDG_CONFIG_HOME: xdg }));
  assert.equal(res.exitCode, 0);
  const file = path.join(xdg, 'opencode', 'config.json');
  assert.ok(fs.existsSync(file), `expected ${file} to exist`);
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(typeof cfg.statusline.command, 'string');
});

test('opencode: prefers existing ~/.opencode/config.json over XDG default', async () => {
  const home = tmpDir('cb-inst-');
  const legacyFile = path.join(home, '.opencode', 'config.json');
  fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
  fs.writeFileSync(legacyFile, JSON.stringify({ theme: 'dark' }));

  const res = await runInstall(['install', 'opencode'], envFor(home));
  assert.equal(res.exitCode, 0);
  // Wrote into the legacy path…
  const cfg = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
  assert.equal(cfg.theme, 'dark');
  assert.ok(cfg.statusline);
  // …and did NOT create the XDG path.
  const xdgFile = path.join(home, '.config', 'opencode', 'config.json');
  assert.equal(fs.existsSync(xdgFile), false);
});

test('opencode: leaves alt-version keys in place and warns', async () => {
  const home = tmpDir('cb-inst-');
  const xdg = path.join(home, '.config');
  const file = path.join(xdg, 'opencode', 'config.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ status_line: { command: '/old' } }));

  const res = await runInstall(['install', 'opencode'], envFor(home, { XDG_CONFIG_HOME: xdg }));
  assert.equal(res.exitCode, 0);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Old key preserved, new key added alongside.
  assert.deepEqual(after.status_line, { command: '/old' });
  assert.ok(after.statusline);
  assert.match(res.stdout.text, /status_line/);
});

// ── Codex installer ───────────────────────────────────────────────────

test('codex: prints wire-up block, touches no files', async () => {
  const home = tmpDir('cb-inst-');
  const res = await runInstall(['install', 'codex'], envFor(home));
  assert.equal(res.exitCode, 0);
  // Each documented env var appears in the output.
  for (const v of ['CODEX_MODEL', 'CODEX_USED_TOKENS', 'CODEX_WINDOW_TOKENS', 'CODEX_COST_USD']) {
    assert.match(res.stdout.text, new RegExp(v));
  }
  // Output contains an absolute-looking command (either /…/context-bart
  // or "node /…/bin/context-bart.js").
  assert.match(res.stdout.text, /context-bart/);
  // Home is untouched.
  assert.deepEqual(fs.readdirSync(home), []);
});

// ── bin/ smoke (real subprocess) ──────────────────────────────────────

test('bin: `install --help` exits 0 via real subprocess', () => {
  const home = tmpDir('cb-inst-');
  const res = spawnSync('node', [BIN, 'install', '--help'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Usage:/);
});

test('bin: `install codex` exits 0 via real subprocess', () => {
  const home = tmpDir('cb-inst-');
  const res = spawnSync('node', [BIN, 'install', 'codex'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /CODEX_MODEL/);
});
