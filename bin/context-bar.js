#!/usr/bin/env node
'use strict';

const { run } = require('../src/index');

run().catch((err) => {
  const msg = (err && err.message) ? String(err.message).split('\n')[0] : 'unknown error';
  process.stdout.write(`ctx ?% · context-bar error: ${msg}\n`);
  process.exit(0);
});
