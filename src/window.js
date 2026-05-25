'use strict';

const DEFAULT_WINDOW = 200_000;
const ONE_MILLION = 1_000_000;

function detectWindowSize(modelId, envOverride) {
  if (envOverride) {
    const n = parseInt(envOverride, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (typeof modelId !== 'string' || !modelId) return DEFAULT_WINDOW;
  if (/\[1m\]\s*$/i.test(modelId)) return ONE_MILLION;
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
