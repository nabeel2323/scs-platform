#!/usr/bin/env node
/**
 * S1.28 — Publish vitest failure details to the GitHub Actions job summary.
 *
 * PURPOSE
 * `pnpm test:integration` runs Vitest with `--reporter=json` so the Redis
 * assertion gate (assert-redis-suite.mjs) has a stable file to parse. A side
 * effect is that Vitest no longer emits `::error::` workflow commands, so the
 * "Integration Tests" job's failure annotations collapse to a bare
 * "Process completed with exit code 1" and the real failing test name is only
 * visible in the raw log. On a public repo that raw log is auth-gated, which
 * makes triage impossible from the API surface alone.
 *
 * This script closes that gap without weakening any gate: it reads the same
 * JSON report the assertion gate consumes and writes an equivalent summary to
 * `$GITHUB_STEP_SUMMARY`, which GitHub renders on the run's public summary
 * page. It never alters exit codes and never touches test expectations.
 *
 * CONTRACT
 * - Reads argv[2] as the vitest JSON report path (defaults to the file written
 *   by `test:integration`).
 * - If `$GITHUB_STEP_SUMMARY` is unset (local invocation), writes the same
 *   text to stdout so a developer can eyeball it.
 * - Always exits 0 regardless of report contents so it never masks the real
 *   failure signal from the earlier step.
 * - Redacts nothing (the JSON reporter does not embed connection strings),
 *   but bounds message size so a huge stack trace cannot blow the summary.
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';

const REPORT_PATH = process.argv[2] ?? '.vitest-integration-results.json';
const SUMMARY_PATH = process.env['GITHUB_STEP_SUMMARY'] ?? '';
const MAX_MESSAGE_CHARS = 1200;

function truncate(text) {
  const s = String(text ?? '');
  if (s.length <= MAX_MESSAGE_CHARS) return s;
  return s.slice(0, MAX_MESSAGE_CHARS) + `\n… (${s.length - MAX_MESSAGE_CHARS} chars truncated)`;
}

function fileName(absolute) {
  const parts = String(absolute ?? '').split(/[\\/]/);
  return parts[parts.length - 1] || String(absolute ?? '');
}

function build() {
  if (!existsSync(REPORT_PATH)) {
    return [
      '### Integration Tests failure — vitest JSON report missing',
      '',
      `Expected \`${REPORT_PATH}\` produced by \`--reporter=json --outputFile=...\`.`,
      'Vitest likely crashed before writing the report (setup error, dependency install failure, or an uncaught throw during collection).',
    ].join('\n');
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
  } catch (err) {
    return [
      '### Integration Tests failure — vitest JSON report unreadable',
      '',
      `Parsing \`${REPORT_PATH}\` failed: ${err.message}`,
    ].join('\n');
  }

  const results = Array.isArray(parsed?.testResults) ? parsed.testResults : [];
  const failures = [];
  const skippedFiles = [];
  let totalTests = 0;
  let passedTests = 0;

  for (const file of results) {
    const assertions = Array.isArray(file?.assertionResults) ? file.assertionResults : [];
    if (file?.status === 'skipped' || file?.status === 'pending') {
      skippedFiles.push(fileName(file?.name));
      continue;
    }
    for (const a of assertions) {
      totalTests += 1;
      if (a?.status === 'passed') passedTests += 1;
      if (a?.status === 'failed') {
        failures.push({
          file: fileName(file?.name),
          title: a?.title ?? '(unnamed)',
          messages: Array.isArray(a?.failureMessages) ? a.failureMessages : [],
        });
      }
    }
  }

  const lines = [];
  lines.push(`### Integration Tests — vitest summary`);
  lines.push('');
  lines.push(`- Files discovered: ${results.length}`);
  lines.push(`- Tests: ${passedTests}/${totalTests} passed`);
  lines.push(`- Failed assertions: ${failures.length}`);
  if (skippedFiles.length) lines.push(`- Skipped files: ${skippedFiles.length}`);
  lines.push('');

  if (failures.length === 0) {
    lines.push(
      'Vitest exited non-zero but no `assertionResults.status === "failed"` entries were recorded.',
    );
    lines.push(
      'The failure is either a workspace/hook-level crash or the Redis assertion gate (`scripts/assert-redis-suite.mjs`) returned non-zero.',
    );
    lines.push('Check the raw log for the assertion-gate stdout.');
  } else {
    lines.push('#### Failing tests');
    lines.push('');
    for (const f of failures) {
      lines.push(`- **\`${f.file}\`** — ${f.title}`);
      for (const m of f.messages) {
        const indented = truncate(m)
          .split('\n')
          .map((l) => `  \`${l.replace(/`/g, '\\`')}\``)
          .join('\n');
        lines.push(indented);
      }
    }
  }

  if (skippedFiles.length) {
    lines.push('');
    lines.push('#### Skipped files');
    for (const n of skippedFiles) lines.push(`- \`${n}\``);
  }

  return lines.join('\n');
}

const text = build();
if (SUMMARY_PATH) {
  try {
    appendFileSync(SUMMARY_PATH, text + '\n');
  } catch {
    /* summary write must never override the real failure signal */
  }
}
console.log(text);
process.exit(0);
