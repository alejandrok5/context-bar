#!/usr/bin/env node
'use strict';

// Detached background fetcher for the once-a-day update notifier.
// Invoked via `node <thisfile> <currentVersion> <cachePath>` by
// src/update-check.js#maybeKickFetch. Never run interactively.
//
// Hard rules:
//   - Exit 0 on every code path. The parent process has already written
//     the status bar; surfacing an error here would be invisible noise
//     at best and a poltergeist log at worst.
//   - Use only Node stdlib. The package advertises zero runtime deps.
//   - Bound the HTTP request with a 5s timeout so a hung registry
//     doesn't leave detached `node` processes lingering.

const fs = require('fs');
const path = require('path');
const https = require('https');

const REGISTRY_URL = 'https://registry.npmjs.org/context-bar/latest';
const TIMEOUT_MS = 5000;

const [, , currentVersion, cacheFile] = process.argv;

if (!currentVersion || !cacheFile) {
  process.exit(0);
}

function done() { process.exit(0); }

// Atomic write: stage into a sibling tmp file then rename, so a
// concurrent reader never sees a half-written JSON document.
function writeAtomic(file, contents) {
  try {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, contents);
    fs.renameSync(tmp, file);
  } catch {
    // Swallow — the next render will retry after the refresh interval.
  }
}

const req = https.get(REGISTRY_URL, {
  headers: { 'accept': 'application/json', 'user-agent': `context-bar/${currentVersion}` },
}, (res) => {
  if (res.statusCode !== 200) {
    res.resume();
    return done();
  }
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    body += chunk;
    // Defensive cap — `latest` payload is ~1KB; if something pipes us
    // megabytes, bail rather than buffer it.
    if (body.length > 64 * 1024) {
      res.destroy();
      done();
    }
  });
  res.on('end', () => {
    let latest = null;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.version === 'string') latest = parsed.version;
    } catch { /* malformed JSON → leave cache untouched */ }
    if (latest) {
      writeAtomic(cacheFile, JSON.stringify({
        latest,
        checkedAt: Date.now(),
        currentInstalledAtCheck: currentVersion,
      }));
    }
    done();
  });
  res.on('error', done);
});

req.setTimeout(TIMEOUT_MS, () => {
  req.destroy();
  done();
});
req.on('error', done);
