'use strict';

const { formatTokens, formatCost } = require('./format');

const ANSI = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

const ZONES = {
  smart:        { label: 'Smart Zone', color: 'green' },
  approaching:  { label: 'Smart Zone', color: 'yellow' },
  dumb:         { label: 'Dumb Zone',  color: 'red' },
};

const DEFAULT_THRESHOLDS = { smart: 30, dumb: 40 };

function pickZone(pct, thresholds = DEFAULT_THRESHOLDS) {
  const { smart, dumb } = thresholds;
  if (pct < smart) return { ...ZONES.smart,        key: 'smart' };
  if (pct < dumb)  return { ...ZONES.approaching,  key: 'approaching' };
  return { ...ZONES.dumb, key: 'dumb' };
}

// Resolve the {smart, dumb} threshold pair. Precedence per field:
//   env var > config file > built-in default.
// Any invalid value (NaN, out of (0, 100), or smart >= dumb) at the
// chosen layer falls through to the next, so a broken config still
// renders a sensible bar.
function readThresholds(env, config = null) {
  const parse = (raw) => {
    if (raw == null || raw === '') return null;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
    return n;
  };
  const cfgZones = config && config.zones ? config.zones : null;
  const smart = parse(env.CONTEXT_BART_ZONE_SMART)
    ?? (cfgZones && cfgZones.smart != null ? cfgZones.smart : null);
  const dumb = parse(env.CONTEXT_BART_ZONE_DUMB)
    ?? (cfgZones && cfgZones.dumb != null ? cfgZones.dumb : null);
  const finalSmart = smart != null ? smart : DEFAULT_THRESHOLDS.smart;
  const finalDumb = dumb != null ? dumb : DEFAULT_THRESHOLDS.dumb;
  if (finalSmart >= finalDumb) return DEFAULT_THRESHOLDS;
  return { smart: finalSmart, dumb: finalDumb };
}

const GLYPHS = {
  unicode: { filled: '▰', empty: '▱' },
  ascii:   { filled: '#', empty: '-' },
};

// Look up the ANSI code for a color name, returning '' (not undefined)
// for unknown keys so a future zone with an unmapped color renders as
// uncolored text instead of leaking the literal string "undefined" into
// the output.
function ansiCode(name) {
  return Object.prototype.hasOwnProperty.call(ANSI, name) ? ANSI[name] : '';
}

function buildBar(pct, color, useColor, useAscii = false) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.min(10, Math.round(clamped / 10));
  const glyphs = useAscii ? GLYPHS.ascii : GLYPHS.unicode;
  const filledStr = glyphs.filled.repeat(filled);
  const emptyStr = glyphs.empty.repeat(10 - filled);
  if (!useColor) return `[${filledStr}${emptyStr}]`;
  const codeFilled = ansiCode(color);
  // If the color isn't in our table, fall back to the uncolored form
  // rather than emitting an undefined-prefixed escape sequence.
  if (!codeFilled) return `[${filledStr}${emptyStr}]`;
  return `[${codeFilled}${filledStr}${ANSI.reset}${ANSI.dim}${emptyStr}${ANSI.reset}]`;
}

// Color precedence:
//   1. FORCE_COLOR overrides everything (npm/supports-color convention).
//      FORCE_COLOR=0/false/"" disables; any other value enables.
//   2. NO_COLOR / CONTEXT_BART_NO_COLOR disable.
//   3. Default: enabled.
//
// We do NOT auto-disable on process.stdout.isTTY === false. The primary
// host (Claude Code) consumes the output through a captured pipe, where
// isTTY is false, but ANSI codes are expected and rendered correctly.
// Disabling color in that case would break the default experience.
// Users who pipe into a non-ANSI consumer can opt out with NO_COLOR.
function shouldUseColor(env, config = null) {
  const fc = env.FORCE_COLOR;
  if (fc != null && fc !== '') {
    return !(fc === '0' || fc === 'false');
  }
  if (env.NO_COLOR != null && env.NO_COLOR !== '') return false;
  if (env.CONTEXT_BART_NO_COLOR != null && env.CONTEXT_BART_NO_COLOR !== '') return false;
  // Config file fallback. "auto" is the same as not setting it.
  if (config && config.color === 'never') return false;
  if (config && config.color === 'always') return true;
  return true;
}

// Render with [#####-----] instead of [▰▰▰▰▰▱▱▱▱▱] when the user opts in
// via CONTEXT_BART_ASCII, or when their locale doesn't advertise UTF-8.
// Some terminals (older Windows cmd, minimal busybox, SSH tunnels with a
// stripped LANG) display the Unicode block glyphs as `??` or tofu, which
// is uglier than plain ASCII.
function shouldUseAscii(env, config = null) {
  if (env.CONTEXT_BART_ASCII != null && env.CONTEXT_BART_ASCII !== '') return true;
  const lc = (env.LC_ALL || env.LC_CTYPE || env.LANG || '');
  if (lc && !/utf-?8/i.test(lc)) return true;
  // Config file fallback: only consulted when neither env nor locale forces ASCII.
  if (config && config.ascii === true) return true;
  return false;
}

function render(payload, { env = process.env, config = null } = {}) {
  const {
    modelDisplayName,
    windowSize,
    usedTokens,
    costUsd,
    branch,
    updateAvailable,
  } = payload;

  const useColor = shouldUseColor(env, config);
  const useAscii = shouldUseAscii(env, config);
  const thresholds = readThresholds(env, config);
  const safeWindow = windowSize > 0 ? windowSize : 200_000;
  const safeUsed = Math.max(0, usedTokens || 0);
  const pct = (safeUsed / safeWindow) * 100;
  const zone = pickZone(pct, thresholds);
  const bar = buildBar(pct, zone.color, useColor, useAscii);

  // Use floor so the displayed integer can never overshoot the actual
  // percentage. pickZone uses strict `<` comparisons, so e.g. pct=29.6
  // is in the green zone — rendering "30%" alongside green text would
  // be inconsistent. floor(29.6) = 29 keeps the label and color in sync.
  const pctStr = `${Math.floor(pct)}%`;
  const zoneCode = useColor ? ansiCode(zone.color) : '';
  const zoneStr = zoneCode
    ? `${zoneCode}${zone.label}${ANSI.reset}`
    : zone.label;
  const tokenStr = `${formatTokens(safeUsed)}/${formatTokens(safeWindow)}`;
  const costStr = formatCost(costUsd);

  // Update notifier: a dim "↑0.2.1" suffix when a newer version is
  // cached. Glyph arrow degrades to "^" on non-UTF locales (same
  // trigger as the bar's ASCII fallback) so it doesn't render as tofu.
  let updateStr = null;
  if (updateAvailable) {
    const arrow = useAscii ? '^' : '↑';
    const body = `${arrow}${updateAvailable}`;
    updateStr = useColor ? `${ANSI.dim}${body}${ANSI.reset}` : body;
  }

  const parts = [
    `${bar} ${pctStr}`,
    zoneStr,
    modelDisplayName || null,
    tokenStr,
    branch || null,
    costStr,
    updateStr,
  ].filter(Boolean);

  return parts.join(' · ');
}

module.exports = { render, pickZone, buildBar, shouldUseColor, shouldUseAscii, readThresholds, GLYPHS, ANSI, DEFAULT_THRESHOLDS };
