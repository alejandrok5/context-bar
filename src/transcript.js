'use strict';

const fs = require('fs');

function sumUsage(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const input = +usage.input_tokens || 0;
  const cacheCreate = +usage.cache_creation_input_tokens || 0;
  const cacheRead = +usage.cache_read_input_tokens || 0;
  return input + cacheCreate + cacheRead;
}

function isCompactBoundary(obj) {
  return (
    obj &&
    obj.type === 'system' &&
    obj.subtype === 'compact_boundary'
  );
}

// Returns the most recent usage-token count, or `null` when we genuinely
// don't have a reading (missing path, unreadable file, no usage block in
// the transcript). The post-/compact case returns a real `0`, not null —
// that's a deliberate "context is empty" signal, not absence of data.
// Callers that just want a number for display can coerce null → 0.
function findLatestUsageTokens(transcriptPath) {
  if (!transcriptPath) return null;
  let content;
  try {
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return null;
  }
  if (!content) return null;

  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    // Stop at the most recent /compact. Any usage block BEFORE this
    // boundary reflects pre-compact context and is misleading.
    // Returning 0 here makes the bar show ~0% until the next assistant
    // turn writes a fresh post-compact usage block.
    if (isCompactBoundary(obj)) return 0;

    const usage = obj && obj.message && obj.message.usage;
    if (usage) return sumUsage(usage);
  }
  return null;
}

module.exports = { findLatestUsageTokens, sumUsage, isCompactBoundary };
