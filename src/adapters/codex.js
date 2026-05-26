'use strict';

// OpenAI Codex CLI (https://github.com/openai/codex) does not (yet) have
// a well-documented statusline contract. We accept either a stdin payload
// with codex-flavored fields or env vars prefixed with CODEX_.
//
// Last verified: no published Codex statusline contract as of 2026-05-26.
// Field names below (codex.usage.total_tokens, codex.model.id, CODEX_*
// env vars) are best-guess based on shape conventions from the OpenAI
// CLIs. Re-check when Codex documents a stable interface.

const NAME = 'codex';

function detect(stdin, env) {
  if (env && (env.CODEX_SESSION_ID || env.CODEX_MODEL || env.CODEX_SESSION)) return true;
  if (!stdin || typeof stdin !== 'object') return false;
  if (stdin.provider === 'codex' || stdin.host === 'codex') return true;
  // Codex JSON often nests under `codex` or has a `task_id`/`agent` field;
  // be conservative — only claim when an explicit marker is present.
  if (stdin.codex && typeof stdin.codex === 'object') return true;
  return false;
}

function pickString(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c;
  }
  return null;
}

function pickNumber(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
  }
  return null;
}

function parse(stdin, env) {
  const e = env || {};
  const codex = stdin.codex || {};
  const usage = stdin.usage || codex.usage || {};
  const model = stdin.model || codex.model || {};

  const modelId = pickString(
    typeof model === 'string' ? model : null,
    model.id,
    model.name,
    stdin.model_id,
    e.CODEX_MODEL,
  );

  const usedTokens = pickNumber(
    usage.total_tokens,
    usage.tokens,
    parseIntOrNull(e.CODEX_USED_TOKENS),
  );

  const windowSize = pickNumber(
    usage.context_window,
    model.context_window,
    parseIntOrNull(e.CODEX_WINDOW_TOKENS),
  );

  const costUsd = pickNumber(
    stdin.cost && stdin.cost.total_usd,
    codex.cost_usd,
    parseFloatOrNull(e.CODEX_COST_USD),
  );

  const cwd = pickString(stdin.cwd, codex.cwd, e.CODEX_CWD, e.PWD);
  const transcriptPath = pickString(stdin.transcript_path, codex.transcript_path, e.CODEX_TRANSCRIPT_PATH);

  return {
    source: NAME,
    modelId,
    modelDisplayName: pickString(model.display_name, model.displayName),
    usedTokens,
    windowSize,
    costUsd,
    cwd,
    transcriptPath,
  };
}

function parseIntOrNull(v) {
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatOrNull(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = { name: NAME, detect, parse };
