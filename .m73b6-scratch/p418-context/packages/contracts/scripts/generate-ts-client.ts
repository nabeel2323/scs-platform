/**
 * Generate TypeScript API client from OpenAPI spec.
 *
 * Usage: pnpm --filter @scs/contracts generate:ts
 *
 * Output: packages/contracts/generated/api.d.ts
 *
 * Uses openapi-typescript to generate type-safe client types
 * from the OpenAPI 3.1 spec produced by generate-openapi.ts.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const OPENAPI_SPEC = path.join(ROOT, 'openapi', 'openapi.json');
const OUTPUT_DIR = path.join(ROOT, 'generated');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'api.d.ts');

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Check that the OpenAPI spec exists
if (!fs.existsSync(OPENAPI_SPEC)) {
  console.error('❌ OpenAPI spec not found. Run `pnpm generate` first.');
  process.exit(1);
}

console.log('🔧 Generating TypeScript client from OpenAPI spec...');

try {
  execSync(
    `npx openapi-typescript "${OPENAPI_SPEC}" --output "${OUTPUT_FILE}"`,
    { stdio: 'inherit', cwd: ROOT }
  );
  console.log(`✅ TypeScript client generated: ${OUTPUT_FILE}`);
} catch (err) {
  console.error('❌ TypeScript client generation failed:', err);
  process.exit(1);
}
