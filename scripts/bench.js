#!/usr/bin/env node
'use strict';

// Microbenchmark for the status-line pipeline. Generates a ~5 MB
// transcript fixture, then spawns bin/context-bart.js N times against
// it and reports the wall-clock distribution. The fixture lives under
// os.tmpdir() and is removed on exit.
//
// Run with: npm run bench  (or: node scripts/bench.js [iterations])

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ITERATIONS = Math.max(5, parseInt(process.argv[2], 10) || 30);
const TARGET_SIZE = 5 * 1024 * 1024;
const BIN = path.join(__dirname, '..', 'bin', 'context-bart.js');

function buildFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-bench-'));
  const file = path.join(dir, 'big.jsonl');
  const padLine = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: 'x'.repeat(500) },
  }) + '\n';
  const usageLine = JSON.stringify({
    type: 'assistant',
    message: { usage: { input_tokens: 100, cache_creation_input_tokens: 1500, cache_read_input_tokens: 412_000 } },
  }) + '\n';

  const fd = fs.openSync(file, 'w');
  let written = 0;
  try {
    while (written < TARGET_SIZE - usageLine.length) {
      fs.writeSync(fd, padLine);
      written += padLine.length;
    }
    fs.writeSync(fd, usageLine);
  } finally {
    fs.closeSync(fd);
  }

  process.on('exit', () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  });

  return file;
}

function payload(transcript) {
  return JSON.stringify({
    transcript_path: transcript,
    model: { id: 'claude-opus-4-7', display_name: 'Opus 4.7' },
    cost: { total_cost_usd: 0.42 },
  });
}

function timeOne(stdin) {
  const t0 = process.hrtime.bigint();
  const res = spawnSync('node', [BIN], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  const t1 = process.hrtime.bigint();
  if (res.status !== 0) {
    throw new Error(`bin exited with status ${res.status}: ${res.stderr}`);
  }
  return Number(t1 - t0) / 1e6;
}

function quantile(sorted, q) {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fmt(ms) {
  return `${ms.toFixed(1)}ms`;
}

function main() {
  process.stdout.write(`Building ${(TARGET_SIZE / 1024 / 1024).toFixed(1)}MB fixture... `);
  const transcript = buildFixture();
  const stdin = payload(transcript);
  process.stdout.write(`done (${fs.statSync(transcript).size.toLocaleString()} bytes)\n`);

  // Warm-up to amortize Node startup, page cache, etc.
  for (let i = 0; i < 3; i++) timeOne(stdin);

  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    samples.push(timeOne(stdin));
  }
  samples.sort((a, b) => a - b);

  const min = samples[0];
  const p50 = quantile(samples, 0.5);
  const p95 = quantile(samples, 0.95);
  const max = samples[samples.length - 1];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

  process.stdout.write(`\n${ITERATIONS} iterations (wall-clock, includes Node startup):\n`);
  process.stdout.write(`  min:    ${fmt(min)}\n`);
  process.stdout.write(`  p50:    ${fmt(p50)}\n`);
  process.stdout.write(`  mean:   ${fmt(mean)}\n`);
  process.stdout.write(`  p95:    ${fmt(p95)}\n`);
  process.stdout.write(`  max:    ${fmt(max)}\n`);
}

main();
