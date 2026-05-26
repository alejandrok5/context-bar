#!/usr/bin/env node
'use strict';

const { run } = require('../src/index');

run().catch((err) => {
  const msg = (err && err.message) ? String(err.message).split('\n')[0] : 'unknown error';
  // Match the width of a normal bar so the status line doesn't visibly
  // shrink and shift surrounding tools when something fails. 10 empty
  // segments + '?%' mirrors the render() output.
  process.stdout.write(`[▱▱▱▱▱▱▱▱▱▱] ?% · context-bart error: ${msg}\n`);
  process.exit(0);
});
