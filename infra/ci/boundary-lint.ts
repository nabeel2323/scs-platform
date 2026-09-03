/**
 * Boundary Lint — enforces modular monolith module isolation (E6).
 *
 * Rules:
 *   1. Modules may NOT import from other modules' internals.
 *      Only allowed: `../<module>/<module>.module` (for DI) and shared contracts.
 *   2. All modules must export their Module class from `<module>.module.ts`.
 *   3. Cross-module communication must go through injected services, not direct imports.
 *
 * Usage: pnpm boundary-lint
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MODULES_DIR = path.resolve(__dirname, '../src/modules');

const MODULES = fs.readdirSync(MODULES_DIR).filter((d) => {
  const full = path.join(MODULES_DIR, d);
  return fs.statSync(full).isDirectory();
});

const errors: string[] = [];

for (const mod of MODULES) {
  const modDir = path.join(MODULES_DIR, mod);
  const files = walkTsFiles(modDir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);

    for (const imp of imports) {
      // Check for cross-module imports (violation)
      for (const otherMod of MODULES) {
        if (otherMod === mod) continue;

        // Allowed: importing the other module's module file for DI
        if (imp.includes(`../${otherMod}/${otherMod}.module`)) continue;
        if (imp.includes(`../${otherMod}/index`)) continue;

        // Violation: importing from another module's internals
        if (imp.includes(`../${otherMod}/`)) {
          const relFile = path.relative(MODULES_DIR, file);
          errors.push(
            `BOUNDARY VIOLATION: ${relFile} imports "${imp}" from module "${otherMod}" internals. ` +
            `Cross-module imports must go through ${otherMod}.module.ts or shared contracts.`
          );
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`\n❌ Boundary lint found ${errors.length} violation(s):\n`);
  for (const err of errors) {
    console.error(`  ${err}`);
  }
  process.exit(1);
} else {
  console.log(`✅ Boundary lint passed — ${MODULES.length} modules, no violations.`);
}

// ── Helpers ──────────────────────────────────────────────────

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(...walkTsFiles(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts') && !full.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

function extractImports(content: string): string[] {
  const regex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1].startsWith('.')) {
      imports.push(match[1]);
    }
  }
  return imports;
}
