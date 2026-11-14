#!/usr/bin/env node
/**
 * Manual SHA Validation Helper
 * 
 * Validates a commit SHA for manual release triggering.
 * This script implements the 6-step validation used by the workflow.
 * 
 * Usage: node validate-release-sha.mjs <sha> <repo-root>
 * 
 * Exit codes:
 *   0 - Valid SHA
 *   1 - Invalid SHA (any validation step failed)
 *   2 - Configuration error
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validate SHA format (40 hex characters)
 */
export function validateSHAFormat(sha) {
  if (!sha || typeof sha !== 'string') {
    return { valid: false, error: 'SHA is empty or not a string' };
  }
  
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    return { valid: false, error: `Invalid SHA format: ${sha} (expected 40 hex chars)` };
  }
  
  return { valid: true };
}

/**
 * Verify SHA exists in repository
 */
export function validateSHAExists(sha, repoRoot) {
  try {
    execSync(`git cat-file -e ${sha}`, { 
      cwd: repoRoot, 
      stdio: 'pipe' 
    });
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `SHA does not exist: ${sha}` };
  }
}

/**
 * Verify SHA is reachable from develop branch
 */
export function validateSHAReachable(sha, repoRoot) {
  try {
    // Ensure we have the latest develop ref
    execSync('git fetch origin develop', { 
      cwd: repoRoot, 
      stdio: 'pipe' 
    });
    
    execSync(`git merge-base --is-ancestor ${sha} origin/develop`, { 
      cwd: repoRoot, 
      stdio: 'pipe' 
    });
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: `SHA not reachable from develop: ${sha}` 
    };
  }
}

/**
 * Find successful CI run for SHA
 * 
 * Note: Requires GitHub CLI (gh) to be authenticated
 */
export function validateCIRunExists(sha, repoRoot, workflowName = 'ci.yml') {
  try {
    const output = execSync(
      `gh run list --workflow=${workflowName} --branch=develop --json databaseId,headSha,headBranch,conclusion --limit 50`,
      { cwd: repoRoot, encoding: 'utf8' }
    );
    
    const runs = JSON.parse(output);
    const matchingRun = runs.find(r => 
      r.headSha === sha && r.conclusion === 'success'
    );
    
    if (!matchingRun) {
      return { 
        valid: false, 
        error: `No successful CI run found for SHA: ${sha}` 
      };
    }
    
    return { valid: true, run: matchingRun };
  } catch (error) {
    return { 
      valid: false, 
      error: `Failed to query CI runs: ${error.message}` 
    };
  }
}

/**
 * Comprehensive validation: all 6 steps
 */
export function validateReleaseSHA(sha, repoRoot) {
  const validations = [];
  
  // Step 1: Format
  const format = validateSHAFormat(sha);
  validations.push({ step: 'format', ...format });
  if (!format.valid) {
    return { valid: false, sha, validations };
  }
  
  // Step 2: Exists
  const exists = validateSHAExists(sha, repoRoot);
  validations.push({ step: 'exists', ...exists });
  if (!exists.valid) {
    return { valid: false, sha, validations };
  }
  
  // Step 3: Reachable from develop
  const reachable = validateSHAReachable(sha, repoRoot);
  validations.push({ step: 'reachable', ...reachable });
  if (!reachable.valid) {
    return { valid: false, sha, validations };
  }
  
  // Steps 4-6: CI run validation (requires gh CLI)
  const ciRun = validateCIRunExists(sha, repoRoot);
  validations.push({ step: 'ci-run', ...ciRun });
  if (!ciRun.valid) {
    return { valid: false, sha, validations };
  }
  
  return { 
    valid: true, 
    sha, 
    validations,
    ciRun: ciRun.run 
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const [sha, repoRoot = process.cwd()] = process.argv.slice(2);
  
  if (!sha) {
    console.error('Usage: node validate-release-sha.mjs <sha> [repo-root]');
    process.exit(2);
  }
  
  const result = validateReleaseSHA(sha, repoRoot);
  
  if (result.valid) {
    console.log(`✓ SHA validation passed: ${sha}`);
    console.log(`  CI Run: ${result.ciRun.databaseId}`);
    process.exit(0);
  } else {
    console.error(`✗ SHA validation failed: ${sha}`);
    result.validations.forEach(v => {
      if (v.valid) {
        console.log(`  ✓ ${v.step}`);
      } else {
        console.error(`  ✗ ${v.step}: ${v.error}`);
      }
    });
    process.exit(1);
  }
}
