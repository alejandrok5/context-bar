'use strict';

const DEFAULT_WINDOW = 200_000;
const ONE_MILLION = 1_000_000;
const TWO_MILLION = 2_000_000;

// Map a model id to the larger-than-200k context window its family is
// known to support. Defaults to 1M — that's the current ceiling for the
// hosts we adapt to, and falling back to 1M when we don't recognize the
// family is safer than guessing higher. Add explicit branches here when
// new tiers ship.
function largeWindowForFamily(modelId) {
  if (typeof modelId !== 'string') return ONE_MILLION;
  // Reserved branch: if/when a 2M-tier id pattern is known, return TWO_MILLION here.
  // e.g. if (/\[2m\]/i.test(modelId)) return TWO_MILLION;
  return ONE_MILLION;
}

function detectWindowSize(modelId, envOverride, signals = {}, config = null) {
  // Highest priority: explicit env override.
  if (envOverride) {
    const n = parseInt(envOverride, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Next: a value pinned in the user config file. Already validated by
  // src/config.js (positive finite integer), so trust it as-is.
  if (config && typeof config.windowTokens === 'number' && config.windowTokens > 0) {
    return config.windowTokens;
  }

  const { usedTokens, exceeds200k } = signals;

  // Strong runtime signal: host told us we've exceeded 200k tokens,
  // OR we observed usage above 200k in the transcript. Either way,
  // we're not on a 200k-window model.
  if (exceeds200k === true) return largeWindowForFamily(modelId);
  if (typeof usedTokens === 'number' && usedTokens > DEFAULT_WINDOW) {
    return largeWindowForFamily(modelId);
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
  // GPT: match the most specific variant first so we don't lose modifiers
  // like "mini" or "turbo" (e.g. gpt-4o-mini must not render as "GPT-4o").
  if (/gpt-?5/i.test(stripped)) return gptVariant(stripped, 'GPT-5');
  if (/gpt-?4o/i.test(stripped)) return gptVariant(stripped, 'GPT-4o');
  if (/gpt-?4/i.test(stripped)) return gptVariant(stripped, 'GPT-4');
  return stripped;
}

function gptVariant(s, base) {
  if (/mini/i.test(s)) return `${base} mini`;
  if (/turbo/i.test(s)) return `${base} Turbo`;
  if (/nano/i.test(s)) return `${base} nano`;
  return base;
}

function matchVersion(s, family) {
  const m = s.match(/(\d+[-.]?\d*)/);
  if (m) {
    const version = m[1].replace('-', '.');
    return `${family} ${version}`;
  }
  return family;
}

module.exports = { detectWindowSize, prettyModelName, largeWindowForFamily, DEFAULT_WINDOW, ONE_MILLION, TWO_MILLION };
