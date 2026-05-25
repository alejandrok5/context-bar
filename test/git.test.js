'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { getBranch } = require('../src/git');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-git-'));
  execSync('git init -q -b test-branch', { cwd: dir });
  // Create an empty commit so HEAD resolves to a branch name.
  execSync('git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: dir });
  return dir;
}

test('getBranch: returns current branch in a repo', () => {
  const dir = tmpRepo();
  assert.equal(getBranch(dir), 'test-branch');
});

test('getBranch: returns null outside a repo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-nogit-'));
  assert.equal(getBranch(dir), null);
});

test('getBranch: returns null for null/missing cwd', () => {
  assert.equal(getBranch(null), null);
  assert.equal(getBranch(undefined), null);
  assert.equal(getBranch(''), null);
});

test('getBranch: returns null for nonexistent dir', () => {
  assert.equal(getBranch('/no/such/dir/anywhere'), null);
});
