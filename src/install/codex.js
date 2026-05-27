'use strict';

// Codex has no central config file to patch. Its statusline contract
// (per docs/install-codex.md and src/adapters/codex.js) is env-var
// driven at invocation time: Codex sets CODEX_* env vars and pipes a
// JSON payload to the script. So `install codex` doesn't write any
// file — it prints a ready-to-paste wire-up block with the absolute
// command path filled in.

module.exports = async function installCodex({ command, log }) {
  log('Codex has no central config file to patch — it reads its statusline');
  log('contract from CODEX_* env vars at invocation time. Paste the block');
  log('below into whichever Codex setting drives the statusline.');
  log('');
  log('Invocation:');
  log(`  echo '{}' | ${command}`);
  log('');
  log('Env vars the Codex adapter reads (set by the host per invocation):');
  log('  CODEX_MODEL          model id, e.g. "gpt-5"');
  log('  CODEX_USED_TOKENS    current context tokens');
  log('  CODEX_WINDOW_TOKENS  context window size, e.g. 200000');
  log('  CODEX_COST_USD       cumulative session cost');
  log('');
  log('Generic fallback (any host that can set env vars): use the CONTEXT_BART_*');
  log('vars listed in the README. See docs/install-codex.md for the full contract.');
  return { ok: true, exitCode: 0 };
};
