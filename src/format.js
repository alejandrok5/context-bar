'use strict';

function formatTokens(n) {
  if (n == null || !Number.isFinite(n) || n < 0) return '0';
  if (n < 1_000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1_000;
    return k >= 100 ? `${Math.round(k)}k` : `${trimZero(k.toFixed(1))}k`;
  }
  const m = n / 1_000_000;
  return m >= 10 ? `${Math.round(m)}M` : `${trimZero(m.toFixed(1))}M`;
}

function formatCost(usd) {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return null;
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function trimZero(s) {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

module.exports = { formatTokens, formatCost };
