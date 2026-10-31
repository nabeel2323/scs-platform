#!/usr/bin/env node
/**
 * Assert that the OTP Redis integration suite executed and passed.
 *
 * This script reads the Vitest JSON output and enforces that:
 * 1. The otp-redis-lua.real.spec.ts file was discovered.
 * 2. The file was not skipped.
 * 3. Exactly 12 tests passed.
 * 4. 0 tests failed.
 * 5. (S1.12) Every other real-Redis throttling suite also executed — a silently
 *    skipped suite must never be mistaken for a passing gate.
 *
 * Exit codes:
 * - 0: all assertions passed (suite executed correctly)
 * - 1: one or more assertions failed (suite skipped, under-counted, or had failures)
 *
 * Usage:
 *   node scripts/assert-redis-suite.mjs <path-to-vitest-json-output>
 *
 * Example:
 *   vitest run --reporter=json > test-results.json
 *   node scripts/assert-redis-suite.mjs test-results.json
 */

import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

const EXPECTED_FILE = 'otp-redis-lua.real.spec.ts';
const EXPECTED_TEST_COUNT = 12;

/**
 * S1.12 — suites that must actually run whenever the job opts in to real Redis.
 * They may pass or fail, but they may not be skipped: skipping would hide the
 * throttling coverage behind the environment gate.
 */
const REQUIRED_EXECUTED_FILES = [
  'cross-instance-throttling.spec.ts',
  'http-cross-instance-throttling.spec.ts',
  'throttle-ip-isolation.spec.ts',
  'throttle-cleanup-sentinel.real.spec.ts',
];

function countSkipped(file) {
  return (file.assertionResults || []).filter(
    (a) => a.status === 'skipped' || a.status === 'pending',
  ).length;
}

function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('ERROR: missing required argument <path-to-vitest-json-output>');
    console.error('Usage: node scripts/assert-redis-suite.mjs <path-to-vitest-json-output>');
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (err) {
    console.error(`ERROR: failed to read or parse ${jsonPath}:`, err.message);
    process.exit(1);
  }

  // Staleness guard: reject reports older than 10 minutes to prevent a stale
  // file from a previous run causing a false-green result.
  const STALE_THRESHOLD_MS = 10 * 60 * 1000;
  try {
    const stat = statSync(jsonPath);
    const age = Date.now() - stat.mtimeMs;
    if (age > STALE_THRESHOLD_MS) {
      console.error(
        `ERROR: report file is stale (age: ${Math.round(age / 1000)}s, threshold: ${STALE_THRESHOLD_MS / 1000}s)`,
      );
      console.error('The report must be generated in the same run as the assertion.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`ERROR: failed to stat ${jsonPath}:`, err.message);
    process.exit(1);
  }

  const { testResults } = data;
  if (!Array.isArray(testResults)) {
    console.error('ERROR: vitest JSON output missing testResults array');
    process.exit(1);
  }

  // Find the otp-redis spec file
  const redisFile = testResults.find((r) => basename(r.name).includes(EXPECTED_FILE));
  if (!redisFile) {
    console.error(`ERROR: ${EXPECTED_FILE} was not discovered by Vitest`);
    console.error('The integration suite may be excluded from the include glob.');
    process.exit(1);
  }

  // Check file status
  if (redisFile.status === 'skipped' || redisFile.status === 'pending') {
    console.error(`ERROR: ${EXPECTED_FILE} was skipped (status: ${redisFile.status})`);
    console.error('The suite must execute when REDIS_IT=1 is set.');
    process.exit(1);
  }

  if (redisFile.status !== 'passed') {
    console.error(`ERROR: ${EXPECTED_FILE} did not pass (status: ${redisFile.status})`);
    console.error('Test failures detected. Review the Vitest output.');
    process.exit(1);
  }

  // Count tests in this file
  const assertions = redisFile.assertionResults || [];
  const passed = assertions.filter((a) => a.status === 'passed').length;
  const failed = assertions.filter((a) => a.status === 'failed').length;
  const skipped = assertions.filter((a) => a.status === 'skipped' || a.status === 'pending').length;

  console.log(`✓ ${EXPECTED_FILE} discovered and executed`);
  console.log(`  Status: ${redisFile.status}`);
  console.log(`  Tests: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (failed > 0) {
    console.error(`ERROR: ${failed} test(s) failed in ${EXPECTED_FILE}`);
    process.exit(1);
  }

  if (skipped > 0) {
    console.error(`ERROR: ${skipped} test(s) skipped in ${EXPECTED_FILE}`);
    console.error('All tests must execute when REDIS_IT=1 is set.');
    process.exit(1);
  }

  if (passed !== EXPECTED_TEST_COUNT) {
    console.error(
      `ERROR: expected ${EXPECTED_TEST_COUNT} tests to pass, but found ${passed}`,
    );
    console.error('The suite may be incomplete or tests may have been removed.');
    process.exit(1);
  }

  console.log(`✓ All ${EXPECTED_TEST_COUNT} tests passed`);

  // S1.12 — no real-Redis throttling suite may be skipped in an opted-in job.
  for (const name of REQUIRED_EXECUTED_FILES) {
    const found = testResults.find((r) => basename(r.name).includes(name));
    if (!found) {
      console.error(`ERROR: ${name} was not discovered by Vitest`);
      console.error('The real-Redis throttling coverage would be silently lost.');
      process.exit(1);
    }
    if (found.status === 'skipped' || found.status === 'pending') {
      console.error(`ERROR: ${name} was skipped (status: ${found.status})`);
      console.error('A skipped real-Redis suite is not a pass.');
      process.exit(1);
    }
    const skippedHere = countSkipped(found);
    if (skippedHere > 0) {
      console.error(`ERROR: ${name} has ${skippedHere} skipped test(s)`);
      console.error('A skipped real-Redis test is not a pass.');
      process.exit(1);
    }
    const passedHere = (found.assertionResults || []).filter((a) => a.status === 'passed').length;
    console.log(`✓ ${name} executed (${passedHere} passed)`);
  }

  console.log('Redis integration gate: PASS');
  process.exit(0);
}

main();
