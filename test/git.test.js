'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execSync } = require('child_process');
const { getBranch, getBranchAndWorktree } = require('../src/git');
const { tmpDir } = require('./_helpers');

function tmpRepo() {
  const dir = tmpDir('cb-git-');
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
  const dir = tmpDir('cb-nogit-');
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

test('getBranchAndWorktree: main checkout reports worktree=null', () => {
  const dir = tmpRepo();
  const r = getBranchAndWorktree(dir);
  assert.equal(r.branch, 'test-branch');
  assert.equal(r.worktree, null);
});

test('getBranchAndWorktree: linked worktree reports its directory name', () => {
  const main = tmpRepo();
  // Create a linked worktree at a sibling path.
  const wtPath = path.join(path.dirname(main), `wt-${path.basename(main)}-extra`);
  execSync(`git worktree add -q -b extra-branch "${wtPath}"`, { cwd: main });

  const r = getBranchAndWorktree(wtPath);
  assert.equal(r.branch, 'extra-branch');
  assert.equal(r.worktree, path.basename(wtPath));

  // The main checkout should still report worktree=null even though
  // a linked worktree now exists alongside it.
  const mainR = getBranchAndWorktree(main);
  assert.equal(mainR.branch, 'test-branch');
  assert.equal(mainR.worktree, null);
});

test('getBranchAndWorktree: non-repo returns both null', () => {
  const dir = tmpDir('cb-nogit-');
  assert.deepEqual(getBranchAndWorktree(dir), { branch: null, worktree: null });
});

test('getBranchAndWorktree: null/missing cwd returns both null', () => {
  assert.deepEqual(getBranchAndWorktree(null), { branch: null, worktree: null });
  assert.deepEqual(getBranchAndWorktree(''), { branch: null, worktree: null });
});
