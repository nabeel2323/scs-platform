// Phase 4.1.15 structural assertions over the js-yaml parse of .github/workflows/ci.yml
// Run from scs-platform root AFTER: pnpm dlx js-yaml .github/workflows/ci.yml > .m73b6-scratch/ci-yaml-parse.json
const fs = require('fs');
const raw = fs.readFileSync('.m73b6-scratch/ci-yaml-parse.json', 'utf8').replace(/^\uFEFF/, ''); // PS 5.1 redirect emits UTF-8 BOM
const j = JSON.parse(raw);
const jobs = j.jobs || (j[true] && j[true].jobs);
if (!jobs) { console.error('FAIL: jobs not found; root keys=' + Object.keys(j).join(',')); process.exit(1); }
const names = Object.keys(jobs);
console.log('JOBS(' + names.length + ')=' + names.join(','));

const cb = jobs['container-build'];
if (!cb) { console.error('FAIL: container-build missing'); process.exit(1); }
const steps = cb.steps.map(s => s.uses || s.name || ('run:' + String(s.run).slice(0, 50)));
console.log('CB_STEPS=' + steps.length);
steps.forEach((s, i) => console.log('  ' + i + ': ' + s));

const pnpmIdx = steps.findIndex(s => String(s).includes('pnpm/action-setup'));
const nodeIdx = steps.findIndex(s => String(s).includes('actions/setup-node'));
const invIdx = steps.findIndex(s => String(s).includes('Run deployment invariants'));
const invCmd = String(cb.steps[invIdx].run).trim().split('\n').map(x => x.trim()).join(' && ');
console.log('PNPM_IDX=' + pnpmIdx + ' NODE_IDX=' + nodeIdx + ' INVARIANT_IDX=' + invIdx);
console.log('ORDER_OK(pnpm<node<invariants)=' + (pnpmIdx !== -1 && nodeIdx !== -1 && pnpmIdx < nodeIdx && nodeIdx < invIdx));
console.log('INV_CMD=' + invCmd);
console.log('INV_HAS_RUN_KEYWORD=' + /pnpm --filter @scs\/api run test -- --run /.test(invCmd));
console.log('INV_BROKEN_FORM_PRESENT=' + /pnpm --filter @scs\/api test /.test(invCmd));
console.log('CONTAINER_CONTINUE_ON_ERROR=' + cb.steps.some(s => s['continue-on-error'] !== undefined));
const safe = cb.steps.find(s => s.name === 'Start API container with safe defaults').run;
console.log('SAFE_DEFAULTS(P13_WORKER_ENABLED=false|P13_PILOT_MODE=legacy)=' +
  /P13_WORKER_ENABLED=false/.test(safe) + '|' + /P13_PILOT_MODE=legacy/.test(safe));
console.log('ENV_NODE=' + j.env.NODE_VERSION + ' ENV_PNPM=' + j.env.PNPM_VERSION);
const ps = cb.steps.find(s => String(s.uses) === 'pnpm/action-setup@v4').with;
const ns = cb.steps.find(s => String(s.uses) === 'actions/setup-node@v4').with;
console.log('CB_PNPM_WITH=' + JSON.stringify(ps));
console.log('CB_NODE_WITH=' + JSON.stringify(ns));
console.log('--- per-job setup audit (every pnpm-consuming job must have the pair) ---');
for (const [n, job] of Object.entries(jobs)) {
  const blob = JSON.stringify(job.steps || []);
  const usesPnpm = /pnpm /.test(blob);
  const hasP = job.steps.some(s => String(s.uses || '').includes('pnpm/action-setup'));
  const hasN = job.steps.some(s => String(s.uses || '').includes('actions/setup-node'));
  const flag = usesPnpm && !(hasP && hasN) ? '  <-- MISSING SETUP' : '';
  console.log('JOB ' + n + ' usesPnpm=' + usesPnpm + ' setupPair=' + hasP + '/' + hasN + flag);
}
