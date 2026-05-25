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

function buildBar(pct, color, useColor) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.min(10, Math.round(clamped / 10));
  const filledStr = '▰'.repeat(filled);
  const emptyStr = '▱'.repeat(10 - filled);
  if (!useColor) return `[${filledStr}${emptyStr}]`;
  return `[${ANSI[color]}${filledStr}${ANSI.reset}${ANSI.dim}${emptyStr}${ANSI.reset}]`;
}

function shouldUseColor(env) {
  if (env.NO_COLOR != null && env.NO_COLOR !== '') return false;
  if (env.CONTEXT_BAR_NO_COLOR != null && env.CONTEXT_BAR_NO_COLOR !== '') return false;
  return true;
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
  const safeWindow = windowSize > 0 ? windowSize : 200_000;
  const safeUsed = Math.max(0, usedTokens || 0);
  const pct = (safeUsed / safeWindow) * 100;
  const zone = pickZone(pct);
  const bar = buildBar(pct, zone.color, useColor);

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

module.exports = { render, pickZone, buildBar, shouldUseColor, ANSI };
