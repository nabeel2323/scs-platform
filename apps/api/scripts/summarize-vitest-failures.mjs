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

// Also emit GitHub Actions `::error::` workflow commands so the failure cause
// surfaces as annotations on the check-run. Annotations are readable via the
// public `/check-runs/<id>/annotations` endpoint without authenticated log
// access, which is the whole point of this diagnostic step. Escape per
// https://docs.github.com/actions/using-workflows/workflow-commands-for-github-actions#multiline-text
// (real newlines are not permitted inside ::error::; encode as %0A).
//
// Three failure classes are distinguished, in priority order:
//   A. Per-assertion failures (`assertionResults[].status === "failed"`) —
//      the most common case; emit one annotation per failing test.
//   B. File-level failures with no assertion failures — a suite crashed during
//      collection, setup, or teardown. Emit one annotation per crashing file.
//   C. Vitest exited 0 but the assertion gate (assert-redis-suite.mjs) would
//      still fail — reproduce the gate's contract in-process so the reason is
//      visible without needing authenticated raw-log access.
const isRunner = Boolean(process.env['GITHUB_ACTIONS']);
const REQUIRED_REDIS_FILES = [
  'otp-redis-lua.real.spec.ts',
  'cross-instance-throttling.spec.ts',
  'http-cross-instance-throttling.spec.ts',
  'throttle-ip-isolation.spec.ts',
  'throttle-cleanup-sentinel.real.spec.ts',
];
const EXPECTED_OTP_REDIS_COUNT = 12;

function diagnose(parsed) {
  const results = Array.isArray(parsed?.testResults) ? parsed.testResults : [];
  const assertionFails = [];
  const fileCrashes = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  for (const f of results) {
    const assertions = Array.isArray(f?.assertionResults) ? f.assertionResults : [];
    const anyFailed = assertions.some((a) => a?.status === 'failed');
    for (const a of assertions) {
      if (a?.status === 'passed') totalPassed += 1;
      else if (a?.status === 'failed') {
        totalFailed += 1;
        assertionFails.push({
          file: fileName(f?.name),
          title: a?.title ?? '(unnamed)',
          msg: (a?.failureMessages ?? []).join('\n'),
        });
      } else totalSkipped += 1;
    }
    if (f?.status === 'failed' && !anyFailed) {
      fileCrashes.push({
        file: fileName(f?.name),
        msg: (f?.assertionResults ?? [])
          .flatMap((a) => a?.failureMessages ?? [])
          .join('\n') ||
          (f?.message ?? 'no assertion records — file failed during collection/setup/teardown'),
      });
    }
  }
  const gateIssues = [];
  for (const req of REQUIRED_REDIS_FILES) {
    const found = results.find((r) => fileName(r?.name).includes(req));
    if (!found) {
      gateIssues.push(`redis-gate: ${req} not discovered by vitest`);
      continue;
    }
    if (found.status === 'skipped' || found.status === 'pending') {
      gateIssues.push(`redis-gate: ${req} skipped (status=${found.status})`);
      continue;
    }
    const list = Array.isArray(found.assertionResults) ? found.assertionResults : [];
    const skippedCount = list.filter((a) => a?.status === 'skipped' || a?.status === 'pending').length;
    if (skippedCount > 0) {
      gateIssues.push(`redis-gate: ${req} has ${skippedCount} skipped test(s)`);
    }
    if (req === 'otp-redis-lua.real.spec.ts') {
      const passedCount = list.filter((a) => a?.status === 'passed').length;
      if (passedCount !== EXPECTED_OTP_REDIS_COUNT) {
        gateIssues.push(
          `redis-gate: ${req} expected ${EXPECTED_OTP_REDIS_COUNT} passed, found ${passedCount}`,
        );
      }
    }
  }
  return { assertionFails, fileCrashes, gateIssues, totals: { totalPassed, totalFailed, totalSkipped } };
}

if (isRunner) {
  const encoded = (s) =>
    String(s ?? '')
      .replace(/%/g, '%25')
      .replace(/\r/g, '%0D')
      .replace(/\n/g, '%0A')
      .replace(/:/g, '%3A');
  try {
    const parsedForAnn = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
    const { assertionFails, fileCrashes, gateIssues, totals } = diagnose(parsedForAnn);

    console.log(
      `::notice title=Integration Tests totals::files=${(parsedForAnn?.testResults ?? []).length}, passed=${totals.totalPassed}, failed=${totals.totalFailed}, skipped=${totals.totalSkipped}`,
    );

    if (assertionFails.length > 0) {
      for (const f of assertionFails) {
        console.log(
          `::error title=${encoded(f.file)} > ${encoded(f.title)}::${encoded(truncate(f.msg))}`,
        );
      }
    } else if (fileCrashes.length > 0) {
      for (const fc of fileCrashes) {
        console.log(
          `::error title=${encoded(fc.file)} (file-level crash)::${encoded(truncate(fc.msg))}`,
        );
      }
    } else if (gateIssues.length > 0) {
      console.log(
        `::error title=Integration Tests: vitest all-pass but Redis assertion gate would reject::${encoded(gateIssues.join(' | '))}`,
      );
    } else {
      console.log(
        `::error title=Integration Tests: vitest exited non-zero with no per-assertion, per-file, or gate-level cause in the JSON report::likely vitest process-level crash (unhandled rejection, worker kill, or out-of-memory). Inspect raw log.`,
      );
    }
  } catch (err) {
    console.log(`::error title=Integration Tests diagnosis::${encoded(err.message)}`);
  }
}

process.exit(0);
