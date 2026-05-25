'use strict';

const { pickAdapter } = require('./detect');
const { findLatestUsageTokens } = require('./transcript');
const { getBranch } = require('./git');
const { render } = require('./render');
const { detectWindowSize, prettyModelName } = require('./window');

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    setTimeout(() => resolve(data), 500);
  });
}

function safeParseJson(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

async function run({ env = process.env, stdin } = {}) {
  const raw = stdin != null ? stdin : await readStdin();
  const parsed = safeParseJson(raw);
  const adapter = pickAdapter(parsed, env);
  const partial = adapter.parse(parsed, env) || {};

  const modelId = partial.modelId || null;
  // Compute used tokens FIRST so we can use them to detect the window size.
  // Most hosts don't expose a reliable window-size field, but the actual
  // token count is an unambiguous lower bound — if we already exceed 200k,
  // we know the window can't be 200k.
  const usedTokens = (partial.usedTokens != null)
    ? partial.usedTokens
    : findLatestUsageTokens(partial.transcriptPath);
  const windowSize = partial.windowSize
    || detectWindowSize(modelId, env.CONTEXT_BAR_WINDOW_TOKENS, {
      usedTokens,
      exceeds200k: partial.exceeds200k,
    });
  const modelDisplayName = partial.modelDisplayName
    || prettyModelName(modelId, partial.modelDisplayName);
  const branch = partial.branch != null
    ? partial.branch
    : getBranch(partial.cwd);

  const payload = {
    modelId,
    modelDisplayName,
    windowSize,
    usedTokens,
    costUsd: partial.costUsd,
    branch,
    cwd: partial.cwd,
    transcriptPath: partial.transcriptPath,
  };

  const line = render(payload, { env });
  process.stdout.write(line + '\n');
}

module.exports = { run, safeParseJson, readStdin };
