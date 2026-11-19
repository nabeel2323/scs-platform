#!/usr/bin/env node

/**
 * Check formatting only for files changed against the PR base branch.
 *
 * The repository has a large pre-existing formatting backlog. This gate keeps
 * new/changed files formatted without requiring unrelated legacy files to be
 * rewritten as part of every PR.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const baseBranch =
  process.env.GITHUB_BASE_REF || process.env.FORMAT_BASE_BRANCH || 'develop';
const baseRef = `origin/${baseBranch}`;

try {
  execFileSync('git', ['merge-base', baseRef, 'HEAD'], { stdio: 'ignore' });
} catch {
  console.error(
    `Cannot find merge base for ${baseRef} and HEAD. Ensure checkout fetch-depth is 0.`,
  );
  process.exit(1);
}

const changed = execFileSync(
  'git',
  ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`],
  { encoding: 'utf8' },
)
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => /\.(ts|tsx|js|jsx|json|md|ya?ml)$/i.test(file))
  .filter((file) => fs.existsSync(path.resolve(file)));

if (changed.length === 0) {
  console.log(`Formatting check: no supported files changed against ${baseRef}.`);
  process.exit(0);
}

console.log(
  `Checking formatting for ${changed.length} changed file(s) against ${baseRef}.`,
);
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpm, ['exec', 'prettier', '--check', ...changed], {
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Unable to run Prettier: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
