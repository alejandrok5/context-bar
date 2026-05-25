'use strict';

const fs = require('fs');

function sumUsage(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const input = +usage.input_tokens || 0;
  const cacheCreate = +usage.cache_creation_input_tokens || 0;
  const cacheRead = +usage.cache_read_input_tokens || 0;
  return input + cacheCreate + cacheRead;
}

function findLatestUsageTokens(transcriptPath) {
  if (!transcriptPath) return 0;
  let content;
  try {
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return 0;
  }
  if (!content) return 0;

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
    const usage = obj && obj.message && obj.message.usage;
    if (usage) return sumUsage(usage);
  }
  return 0;
}

module.exports = { findLatestUsageTokens, sumUsage };
