// Temporary Phase 4.1 helper: consistent line counts for the baseline audit.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = 'c:/TAIF/scs-platform';

function lines(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { rel, lines: null, bytes: null, missing: true };
  const buf = fs.readFileSync(abs, 'utf8');
  return { rel, lines: buf.split(/\r?\n/).length, bytes: fs.statSync(abs).size };
}

const opsDir = path.join(ROOT, 'apps/api/src/modules/operations');
const ops = fs.readdirSync(opsDir).filter((f) => f.endsWith('.ts'));
let total = 0;
console.log('=== apps/api/src/modules/operations ===');
for (const f of ops) {
  const r = lines(path.join('apps/api/src/modules/operations', f));
  total += r.lines;
  console.log(`  ${f.padEnd(34)} ${String(r.lines).padStart(5)} lines  ${String(r.bytes).padStart(7)} B`);
}
console.log(`  ${'TOTAL'.padEnd(34)} ${String(total).padStart(5)} lines`);

console.log('\n=== specs / migration / reports ===');
for (const rel of [
  'apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts',
  'apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts',
  'infra/drizzle/migrations/0063_phase4_operational_readiness.sql',
]) {
  const r = lines(rel);
  console.log(`  ${rel.split('/').pop().padEnd(52)} ${String(r.lines).padStart(5)} lines`);
}

const docs = fs.readdirSync(path.join(ROOT, 'docs/production')).filter((f) => f.startsWith('P13-PHASE-4-'));
console.log(`\n=== Phase 4 reports (${docs.length}) ===`);
for (const f of docs) {
  const r = lines(path.join('docs/production', f));
  console.log(`  ${f.padEnd(60)} ${String(r.lines).padStart(5)} lines`);
}
