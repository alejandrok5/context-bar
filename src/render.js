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

function pickZone(pct) {
  if (pct < 30) return { ...ZONES.smart,        key: 'smart' };
  if (pct < 40) return { ...ZONES.approaching,  key: 'approaching' };
  return { ...ZONES.dumb, key: 'dumb' };
}

const GLYPHS = {
  unicode: { filled: '▰', empty: '▱' },
  ascii:   { filled: '#', empty: '-' },
};

function buildBar(pct, color, useColor, useAscii = false) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.min(10, Math.round(clamped / 10));
  const glyphs = useAscii ? GLYPHS.ascii : GLYPHS.unicode;
  const filledStr = glyphs.filled.repeat(filled);
  const emptyStr = glyphs.empty.repeat(10 - filled);
  if (!useColor) return `[${filledStr}${emptyStr}]`;
  return `[${ANSI[color]}${filledStr}${ANSI.reset}${ANSI.dim}${emptyStr}${ANSI.reset}]`;
}

// Color precedence:
//   1. FORCE_COLOR overrides everything (npm/supports-color convention).
//      FORCE_COLOR=0/false/"" disables; any other value enables.
//   2. NO_COLOR / CONTEXT_BAR_NO_COLOR disable.
//   3. Default: enabled.
//
// We do NOT auto-disable on process.stdout.isTTY === false. The primary
// host (Claude Code) consumes the output through a captured pipe, where
// isTTY is false, but ANSI codes are expected and rendered correctly.
// Disabling color in that case would break the default experience.
// Users who pipe into a non-ANSI consumer can opt out with NO_COLOR.
function shouldUseColor(env) {
  const fc = env.FORCE_COLOR;
  if (fc != null && fc !== '') {
    return !(fc === '0' || fc === 'false');
  }
  if (env.NO_COLOR != null && env.NO_COLOR !== '') return false;
  if (env.CONTEXT_BAR_NO_COLOR != null && env.CONTEXT_BAR_NO_COLOR !== '') return false;
  return true;
}

// Render with [#####-----] instead of [▰▰▰▰▰▱▱▱▱▱] when the user opts in
// via CONTEXT_BAR_ASCII, or when their locale doesn't advertise UTF-8.
// Some terminals (older Windows cmd, minimal busybox, SSH tunnels with a
// stripped LANG) display the Unicode block glyphs as `??` or tofu, which
// is uglier than plain ASCII.
function shouldUseAscii(env) {
  if (env.CONTEXT_BAR_ASCII != null && env.CONTEXT_BAR_ASCII !== '') return true;
  const lc = (env.LC_ALL || env.LC_CTYPE || env.LANG || '');
  if (lc && !/utf-?8/i.test(lc)) return true;
  return false;
}

function render(payload, { env = process.env } = {}) {
  const {
    modelDisplayName,
    windowSize,
    usedTokens,
    costUsd,
    branch,
  } = payload;

  const useColor = shouldUseColor(env);
  const useAscii = shouldUseAscii(env);
  const safeWindow = windowSize > 0 ? windowSize : 200_000;
  const safeUsed = Math.max(0, usedTokens || 0);
  const pct = (safeUsed / safeWindow) * 100;
  const zone = pickZone(pct);
  const bar = buildBar(pct, zone.color, useColor, useAscii);

  const pctStr = `${Math.round(pct)}%`;
  const zoneStr = useColor
    ? `${ANSI[zone.color]}${zone.label}${ANSI.reset}`
    : zone.label;
  const tokenStr = `${formatTokens(safeUsed)}/${formatTokens(safeWindow)}`;
  const costStr = formatCost(costUsd);

  const parts = [
    `${bar} ${pctStr}`,
    zoneStr,
    modelDisplayName || null,
    tokenStr,
    branch || null,
    costStr,
  ].filter(Boolean);

  return parts.join(' · ');
}

module.exports = { render, pickZone, buildBar, shouldUseColor, shouldUseAscii, GLYPHS, ANSI };
