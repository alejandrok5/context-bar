#!/usr/bin/env node
'use strict';

const sub = process.argv[2];

if (sub === 'install') {
  const { install } = require('../src/install');
  install(process.argv).then((res) => {
    process.exit(res.exitCode || 0);
  }).catch((err) => {
    process.stderr.write(`error: ${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
} else if (sub === '--help' || sub === '-h') {
  const { usage } = require('../src/install');
  process.stdout.write(usage() + '\n');
  process.exit(0);
} else {
  const { run } = require('../src/index');
  run().catch((err) => {
    const msg = (err && err.message) ? String(err.message).split('\n')[0] : 'unknown error';
    // Match the width of a normal bar so the status line doesn't visibly
    // shrink and shift surrounding tools when something fails. 10 empty
    // segments + '?%' mirrors the render() output.
    process.stdout.write(`[▱▱▱▱▱▱▱▱▱▱] ?% · context-bart error: ${msg}\n`);
    process.exit(0);
  });
}
