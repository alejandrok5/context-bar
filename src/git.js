'use strict';

const { execSync } = require('child_process');
const path = require('path');

// Returns `{ branch, worktree }` for the given cwd:
//   branch:   current branch name (null if detached or non-repo)
//   worktree: basename of the linked worktree directory if cwd is a
//             linked worktree, otherwise null. The main checkout always
//             reports worktree=null even if other worktrees exist.
//
// We deliberately don't memoize across calls. The status-line script is
// invoked as a fresh, short-lived process by the host on every turn, so
// an in-process cache would have nothing to hit. Persisting a cache to
// disk would cost more than the ~10-30ms it would save.
function getBranchAndWorktree(cwd) {
  if (!cwd) return { branch: null, worktree: null };
  let out;
  try {
    out = execSync(
      'git rev-parse --abbrev-ref HEAD --show-toplevel --git-common-dir --git-dir',
      {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 250,
        encoding: 'utf8',
      },
    );
  } catch {
    return { branch: null, worktree: null };
  }

  const lines = (out || '').trim().split('\n').map((s) => s.trim());
  if (lines.length < 4) return { branch: null, worktree: null };

  const [branchRaw, toplevel, commonDirRaw, gitDirRaw] = lines;
  const branch = branchRaw && branchRaw !== 'HEAD' ? branchRaw : null;

  // Linked worktrees have a per-worktree `.git` dir nested under the main
  // repo's `.git/worktrees/<name>/`. For the main checkout, --git-dir and
  // --git-common-dir resolve to the same path; for linked worktrees, they
  // differ. Both are reported relative to `cwd` so we resolve them.
  const commonDir = path.resolve(cwd, commonDirRaw);
  const gitDir = path.resolve(cwd, gitDirRaw);
  const isLinkedWorktree = commonDir !== gitDir;
  const worktree = isLinkedWorktree && toplevel ? path.basename(toplevel) : null;

  return { branch, worktree };
}

// Back-compat wrapper for callers that only want the branch string.
function getBranch(cwd) {
  return getBranchAndWorktree(cwd).branch;
}

module.exports = { getBranch, getBranchAndWorktree };
