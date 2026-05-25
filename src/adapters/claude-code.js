'use strict';

const NAME = 'claude-code';

function detect(stdin) {
  if (!stdin || typeof stdin !== 'object') return false;
  return (
    typeof stdin.transcript_path === 'string' &&
    stdin.model && typeof stdin.model === 'object'
  );
}

function parse(stdin) {
  const model = stdin.model || {};
  const workspace = stdin.workspace || {};
  const cost = stdin.cost || {};
  const cwd = stdin.cwd || workspace.current_dir || workspace.project_dir || null;

  return {
    source: NAME,
    modelId: model.id || null,
    modelDisplayName: model.display_name || null,
    transcriptPath: stdin.transcript_path || null,
    cwd,
    costUsd: typeof cost.total_cost_usd === 'number' ? cost.total_cost_usd : null,
    // usedTokens left undefined → orchestrator will compute from transcript
    // windowSize left undefined → orchestrator will detect from modelId
  };
}

module.exports = { name: NAME, detect, parse };
