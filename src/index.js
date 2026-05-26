'use strict';

const { pickAdapter } = require('./detect');
const { findLatestUsageTokens } = require('./transcript');
const { getBranchAndWorktree } = require('./git');
const { render } = require('./render');
const { detectWindowSize, prettyModelName } = require('./window');
const { readCachedUpdate, maybeKickFetch } = require('./update-check');

// Read package.json once at module load. Used by the update notifier
// to compare against the cached `latest` from the npm registry. We
// intentionally try/catch — a corrupted install shouldn't break the bar.
let CURRENT_VERSION = null;
try { CURRENT_VERSION = require('../package.json').version || null; }
catch { CURRENT_VERSION = null; }

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    let timer = null;
    const done = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      resolve(data);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', done);
    process.stdin.on('error', done);
    timer = setTimeout(done, 500);
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
  // findLatestUsageTokens may return null when we genuinely have no reading
  // (no transcript, unreadable file, no usage blocks). Coerce to 0 for the
  // render path so the bar still shows; window detection ignores null.
  const transcriptUsage = findLatestUsageTokens(partial.transcriptPath);
  const usedTokens = (partial.usedTokens != null)
    ? partial.usedTokens
    : (transcriptUsage != null ? transcriptUsage : 0);
  const windowSize = partial.windowSize
    || detectWindowSize(modelId, env.CONTEXT_BART_WINDOW_TOKENS, {
      usedTokens,
      exceeds200k: partial.exceeds200k,
    });
  const modelDisplayName = partial.modelDisplayName
    || prettyModelName(modelId, partial.modelDisplayName);
  const { branch: detectedBranch, worktree: detectedWorktree } =
    getBranchAndWorktree(partial.cwd);
  const branch = partial.branch != null ? partial.branch : detectedBranch;
  const worktree = partial.worktree != null ? partial.worktree : detectedWorktree;
  // Combine for the render layer: `main` for the primary checkout,
  // `main@worktree_3` when we're in a linked worktree.
  const branchDisplay = branch && worktree ? `${branch}@${worktree}` : branch;

  const update = readCachedUpdate({ env, currentVersion: CURRENT_VERSION });

  const payload = {
    modelId,
    modelDisplayName,
    windowSize,
    usedTokens,
    costUsd: partial.costUsd,
    branch: branchDisplay,
    cwd: partial.cwd,
    transcriptPath: partial.transcriptPath,
    updateAvailable: update ? update.latest : null,
  };

  const line = render(payload, { env });
  process.stdout.write(line + '\n');

  // Kick the background refresh AFTER the bar is on the wire so even a
  // spawn-syscall hiccup can't delay the user-visible render.
  maybeKickFetch({ env, currentVersion: CURRENT_VERSION, scriptDir: __dirname });
}

module.exports = { run, safeParseJson, readStdin };
