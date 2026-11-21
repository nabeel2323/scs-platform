#!/usr/bin/env node

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = [
  'docs/remediation/G-002-RLS-ARCHITECTURE-DESIGN.md',
  'docs/remediation/G-002-TABLE-OWNERSHIP-MATRIX.md',
  'docs/remediation/IMPLEMENTATION-PROGRESS.md',
  'project-memory/CURRENT-STATE.md',
  'project-memory/OPEN-ISSUES.md',
  'project-memory/RELEASE-AND-CI-STATUS.md',
  'project-memory/START-HERE.md',
  'project-memory/WORK-LOG.md',
];

execFileSync('pnpm', ['exec', 'prettier', '--write', ...files], {
  stdio: 'inherit',
});

for (const file of files) {
  const formatted = fs.readFileSync(file, 'utf8');
  console.log(`FORMAT_EXPORT_BEGIN:${file}`);
  console.log(Buffer.from(formatted, 'utf8').toString('base64'));
  console.log(`FORMAT_EXPORT_END:${file}`);
}
