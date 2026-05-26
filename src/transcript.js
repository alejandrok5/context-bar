'use strict';

const fs = require('fs');

// Read at most this many bytes from the tail of a transcript before
// scanning for the most recent usage block. Claude Code's status line
// runs on every turn; for multi-MB 1M-context sessions a full-file read
// is wasted work. 256KB easily covers the last few turns of even very
// busy sessions, and we fall back to a full read if the tail comes up
// empty.
const TAIL_BYTES = 256 * 1024;

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

// Walk the lines of `content` from the end and return:
//   { value: <number> } — most recent usage or post-/compact zero
//   null                — no usage and no compact_boundary in this slice
function scanLatestUsage(content) {
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
    if (isCompactBoundary(obj)) return { value: 0 };
    const usage = obj && obj.message && obj.message.usage;
    if (usage) return { value: sumUsage(usage) };
  }
  return null;
}

// Read up to `bytes` from the end of a file. Returns
//   { content, isPartial }  on success
//   null                     on I/O failure
// When isPartial is true (file was bigger than `bytes`) the first
// possibly-truncated line is dropped so the caller never JSON.parses
// a fragment.
function readTail(filePath, bytes) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    return null;
  }
  try {
    const size = fs.fstatSync(fd).size;
    if (size === 0) return { content: '', isPartial: false };
    const toRead = Math.min(bytes, size);
    const start = size - toRead;
    const buf = Buffer.allocUnsafe(toRead);
    fs.readSync(fd, buf, 0, toRead, start);
    let content = buf.toString('utf8');
    const isPartial = start > 0;
    if (isPartial) {
      const nl = content.indexOf('\n');
      if (nl >= 0) content = content.slice(nl + 1);
      else content = ''; // single >256KB line — give up on the tail
    }
    return { content, isPartial };
  } catch {
    return null;
  } finally {
    try { fs.closeSync(fd); } catch { /* best effort */ }
  }
}

// Returns the most recent usage-token count, or `null` when we genuinely
// don't have a reading (missing path, unreadable file, no usage block in
// the transcript). The post-/compact case returns a real `0`, not null —
// that's a deliberate "context is empty" signal, not absence of data.
// Callers that just want a number for display can coerce null → 0.
function findLatestUsageTokens(transcriptPath) {
  if (!transcriptPath) return null;

  const tail = readTail(transcriptPath, TAIL_BYTES);
  if (!tail) return null;

  const fromTail = scanLatestUsage(tail.content);
  if (fromTail) return fromTail.value;

  // Tail had nothing actionable. If we truncated, fall back to a
  // full-file read so we can find usage older than TAIL_BYTES.
  if (tail.isPartial) {
    let content;
    try { content = fs.readFileSync(transcriptPath, 'utf8'); }
    catch { return null; }
    const full = scanLatestUsage(content);
    return full ? full.value : null;
  }

  return null;
}

module.exports = { findLatestUsageTokens, sumUsage, isCompactBoundary, TAIL_BYTES };
