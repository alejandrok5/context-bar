'use strict';

// Generic fallback adapter. Reads everything from CONTEXT_BAR_* env vars.
// Use this for any host not covered by a dedicated adapter, as long as
// the host can set env vars before invoking the script.

const NAME = 'env';

function detect() {
  // Always matches as the last-resort adapter.
  return true;
}

function parse(_stdin, env) {
  const e = env || {};
  return {
    source: NAME,
    modelId: e.CONTEXT_BAR_MODEL_ID || null,
    modelDisplayName: e.CONTEXT_BAR_MODEL_NAME || null,
    usedTokens: parseIntOrNull(e.CONTEXT_BAR_USED_TOKENS),
    windowSize: parseIntOrNull(e.CONTEXT_BAR_WINDOW_TOKENS),
    costUsd: parseFloatOrNull(e.CONTEXT_BAR_COST_USD),
    cwd: e.CONTEXT_BAR_CWD || e.PWD || null,
    transcriptPath: e.CONTEXT_BAR_TRANSCRIPT_PATH || null,
  };
}

function parseIntOrNull(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatOrNull(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = { name: NAME, detect, parse };
