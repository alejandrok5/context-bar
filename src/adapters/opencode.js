'use strict';

// OpenCode (https://opencode.ai) ships its own statusline contract.
// As of the time of writing it provides a JSON payload on stdin with
// fields like { session, model, usage }. The exact shape may evolve,
// so we read defensively and fall back where fields are missing.

const NAME = 'opencode';

function detect(stdin, env) {
  if (env && env.OPENCODE_SESSION) return true;
  if (!stdin || typeof stdin !== 'object') return false;
  // OpenCode payload signals: presence of `session` object with a `model`
  // field but no `transcript_path` (which would be Claude Code's signature).
  const hasOpenCodeSession =
    stdin.session && typeof stdin.session === 'object' && stdin.session.model;
  const hasNoTranscript = !stdin.transcript_path;
  if (hasOpenCodeSession && hasNoTranscript) return true;
  // Alternative: a top-level `provider` field set to "opencode".
  if (stdin.provider === 'opencode' || stdin.host === 'opencode') return true;
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
  const session = stdin.session || {};
  const usage = stdin.usage || session.usage || {};
  const model = session.model || stdin.model || {};
  const modelId = pickString(
    typeof model === 'string' ? model : null,
    model.id,
    model.name,
    stdin.modelId,
    env && env.OPENCODE_MODEL,
  );
  const modelDisplayName = pickString(
    model.display_name,
    model.displayName,
    model.label,
  );

  // OpenCode's `usage` typically carries cumulative tokens for the session.
  const usedTokens = pickNumber(
    usage.total_tokens,
    usage.input_tokens != null && usage.output_tokens != null
      ? (usage.input_tokens + usage.output_tokens)
      : null,
    usage.tokens,
    stdin.tokens_used,
  );

  const windowSize = pickNumber(
    usage.context_window,
    model.context_window,
    model.max_tokens,
    stdin.context_window,
  );

  const costUsd = pickNumber(
    stdin.cost && stdin.cost.total_usd,
    session.cost_usd,
    stdin.cost_usd,
  );

  const cwd = pickString(stdin.cwd, stdin.workspace && stdin.workspace.cwd, session.cwd);

  return {
    source: NAME,
    modelId,
    modelDisplayName,
    usedTokens,
    windowSize,
    costUsd,
    cwd,
    transcriptPath: pickString(stdin.transcript_path, session.transcript_path),
  };
}

module.exports = { name: NAME, detect, parse };
