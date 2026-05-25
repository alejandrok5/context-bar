'use strict';

const DEFAULT_WINDOW = 200_000;
const ONE_MILLION = 1_000_000;

function detectWindowSize(modelId, envOverride, signals = {}) {
  // Highest priority: explicit env override.
  if (envOverride) {
    const n = parseInt(envOverride, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const { usedTokens, exceeds200k } = signals;

  // Strong runtime signal: host told us we've exceeded 200k tokens,
  // OR we observed usage above 200k in the transcript. Either way,
  // we're not on a 200k-window model.
  if (exceeds200k === true) return ONE_MILLION;
  if (typeof usedTokens === 'number' && usedTokens > DEFAULT_WINDOW) {
    return ONE_MILLION;
  }

  // Static signal: model id explicitly carries the [1m] suffix
  // (this is how some hosts surface the extended-context variant).
  if (typeof modelId === 'string' && /\[1m\]\s*$/i.test(modelId)) {
    return ONE_MILLION;
  }

  return DEFAULT_WINDOW;
}

function prettyModelName(modelId, displayName) {
  if (displayName && typeof displayName === 'string') return displayName;
  if (!modelId || typeof modelId !== 'string') return null;
  const stripped = modelId.replace(/\[1m\]\s*$/i, '');
  if (/opus/i.test(stripped)) return matchVersion(stripped, 'Opus');
  if (/sonnet/i.test(stripped)) return matchVersion(stripped, 'Sonnet');
  if (/haiku/i.test(stripped)) return matchVersion(stripped, 'Haiku');
  if (/gpt-?5/i.test(stripped)) return 'GPT-5';
  if (/gpt-?4o/i.test(stripped)) return 'GPT-4o';
  if (/gpt-?4/i.test(stripped)) return 'GPT-4';
  return stripped;
}

function matchVersion(s, family) {
  const m = s.match(/(\d+[-.]?\d*)/);
  if (m) {
    const version = m[1].replace('-', '.');
    return `${family} ${version}`;
  }
  return family;
}

module.exports = { detectWindowSize, prettyModelName, DEFAULT_WINDOW, ONE_MILLION };
