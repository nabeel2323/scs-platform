// Temporary Phase 4.1 helper: scan the working-tree change set for real credential
// VALUES (not the English words "token"/"secret"), and report generated artifacts.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = 'c:/TAIF/scs-platform';
process.chdir(ROOT);

function list(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

const tracked = list('git diff --name-only');
const untracked = list('git ls-files --others --exclude-standard');
const files = Array.from(new Set([...tracked, ...untracked]));

// Credential VALUES, not vocabulary words.
const PATTERNS = [
  ['dev-db-password', /scs_dev_2026/],
  ['connection-uri-with-auth', /[a-z]+:\/\/[^/\s"'`]+:[^/\s"'`]+@/i],
  ['jwt-like-token', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/],
  ['private-key-block', /-----BEGIN (RSA|EC|DSA|OPENSSH|PRIVATE) KEY-----/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-token', /\b(ghp|gho|github_pat)_[A-Za-z0-9]{20,}\b/],
  ['slack-webhook', /hooks\.slack\.com\/services\/T/],
  ['long-assigned-secret', /(?:SECRET|PASSWORD|TOKEN|KEY)\s*[:=]\s*['"`][A-Za-z0-9+/=_\-]{20,}['"`]/i],
];

const findings = [];
for (const f of files) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [name, re] of PATTERNS) {
      if (re.test(line)) {
        findings.push(`${name} :: ${f}:${i + 1} :: ${line.trim().slice(0, 150)}`);
      }
    }
  });
}

console.log(`SCANNED_FILES=${files.length}`);
console.log(`FINDINGS=${findings.length}`);
for (const x of findings.slice(0, 60)) console.log('  ' + x);

// Generated artifacts / dumps that must not be part of a release change set.
console.log('\n=== suspicious artifact types in the change set ===');
const suspicious = files.filter((f) =>
  /(\.next[\\/]|node_modules[\\/]|\.env$|\.log$|\.dump$|\.sql\.bak$|dist[\\/]|coverage[\\/]|\.png$|\.zip$)/i.test(f),
);
console.log(suspicious.length ? suspicious.join('\n') : '  none');
