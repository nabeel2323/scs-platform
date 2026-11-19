#!/usr/bin/env node

/**
 * Check formatting on PR-changed files, while preserving an exact-hash baseline
 * for legacy files that were already unformatted when the gate was introduced.
 * Any edit to a baseline file invalidates its exemption and makes Prettier run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const baseBranch =
  process.env.GITHUB_BASE_REF || process.env.FORMAT_BASE_BRANCH || 'develop';
const baseRef = `origin/${baseBranch}`;
const baselinePath = path.resolve('infra/ci/format-baseline.json');
const baselineDocument = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const knownUnformatted = baselineDocument.knownUnformatted ?? {};

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

const check = [];
const exempt = [];
for (const file of changed) {
  const baselineHash = knownUnformatted[file];
  if (baselineHash) {
    const currentHash = execFileSync('git', ['hash-object', '--no-filters', file], {
      encoding: 'utf8',
    }).trim();
    if (currentHash === baselineHash) {
      exempt.push(file);
      continue;
    }
  }
  check.push(file);
}

console.log(
  `Formatting gate: ${check.length} file(s) to check; ${exempt.length} unchanged legacy ` +
    `formatting exception(s); ${changed.length} PR-changed file(s) total.`,
);

if (check.length === 0) {
  console.log('Formatting check passed: no new or modified files require checking.');
  process.exit(0);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpm, ['exec', 'prettier', '--check', ...check], {
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Unable to run Prettier: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
