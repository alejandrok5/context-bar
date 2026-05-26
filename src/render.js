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

// Resolve the {smart, dumb} threshold pair from the user config, falling
// back to the built-in defaults when a field is missing. src/config.js
// is responsible for validation (range, smart < dumb); we only need to
// fill in the gaps here.
function readThresholds(config = null) {
  const cfgZones = config && config.zones ? config.zones : null;
  const smart = cfgZones && cfgZones.smart != null ? cfgZones.smart : DEFAULT_THRESHOLDS.smart;
  const dumb = cfgZones && cfgZones.dumb != null ? cfgZones.dumb : DEFAULT_THRESHOLDS.dumb;
  if (smart >= dumb) return DEFAULT_THRESHOLDS;
  return { smart, dumb };
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

// Color comes solely from the config file: "never" disables, "always"
// or "auto" (the default) enables. We do NOT auto-disable on
// process.stdout.isTTY === false: the primary host (Claude Code)
// consumes the output through a captured pipe where isTTY is false but
// ANSI codes still render correctly. Users on a non-ANSI consumer set
// `"color": "never"` in their config.
function shouldUseColor(config = null) {
  if (config && config.color === 'never') return false;
  return true;
}

// Render with [#####-----] instead of [▰▰▰▰▰▱▱▱▱▱] when the user opts
// in via `"ascii": true` in the config file, or when their locale
// doesn't advertise UTF-8. Some terminals (older Windows cmd, minimal
// busybox, SSH tunnels with a stripped LANG) display the Unicode block
// glyphs as `??` or tofu, which is uglier than plain ASCII. Locale
// detection isn't a "preference" — it's terminal-capability detection
// — so it stays in env even though user prefs no longer do.
function shouldUseAscii(env, config = null) {
  const lc = (env.LC_ALL || env.LC_CTYPE || env.LANG || '');
  if (lc && !/utf-?8/i.test(lc)) return true;
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

  const useColor = shouldUseColor(config);
  const useAscii = shouldUseAscii(env, config);
  const thresholds = readThresholds(config);
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
