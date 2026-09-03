/**
 * Generate Dart API client from OpenAPI spec.
 *
 * Usage: pnpm --filter @scs/contracts generate:dart
 *
 * Output: mobile/packages/api_client/ (Dart package)
 *
 * Uses openapi-generator-cli to generate a Dio-based Dart client
 * from the OpenAPI 3.1 spec produced by generate-openapi.ts.
 *
 * Prerequisites: Java 11+ and openapi-generator-cli installed.
 *   npm install -g @openapitools/openapi-generator-cli
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const OPENAPI_SPEC = path.join(ROOT, 'openapi', 'openapi.json');
const OUTPUT_DIR = path.resolve(ROOT, '../../mobile/packages/api_client');

// Check that the OpenAPI spec exists
if (!fs.existsSync(OPENAPI_SPEC)) {
  console.error('❌ OpenAPI spec not found. Run `pnpm generate` first.');
  process.exit(1);
}

console.log('🔧 Generating Dart API client from OpenAPI spec...');

try {
  execSync(
    [
      'npx @openapitools/openapi-generator-cli generate',
      `-i "${OPENAPI_SPEC}"`,
      '-g dart-dio',
      `-o "${OUTPUT_DIR}"`,
      '--package-name api_client',
      '--additional-properties=useEnumExtension=true,pubAuthor=SCS,pubName=api_client',
    ].join(' '),
    { stdio: 'inherit', cwd: ROOT }
  );
  console.log(`✅ Dart client generated: ${OUTPUT_DIR}`);
} catch (err) {
  console.error('❌ Dart client generation failed:', err);
  process.exit(1);
}
