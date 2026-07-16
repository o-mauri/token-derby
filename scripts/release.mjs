#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const component = process.argv[2];
if (component !== 'site' && component !== 'cli') {
  console.error('usage: release.mjs <site|cli>');
  process.exit(1);
}

const pkgPath = resolve(ROOT, component === 'site' ? 'site/package.json' : 'cli/package.json');
const changelogPath = resolve(ROOT, 'site/src/changelog.json');

const bump = (v, kind) => {
  const [maj, min, pat] = v.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
};

const rl = createInterface({ input, output });

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const current = pkg.version;
console.log(`\n${component} is at v${current}`);
console.log(`  patch → ${bump(current, 'patch')}    minor → ${bump(current, 'minor')}    major → ${bump(current, 'major')}`);

const kind = (await rl.question('bump [patch/minor/major]: ')).trim().toLowerCase();
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('invalid bump type — aborting, no changes made.');
  rl.close();
  process.exit(1);
}
const next = bump(current, kind);

console.log('\nDescription — one bullet per line, blank line to finish:');
const changes = [];
for (;;) {
  const line = (await rl.question('• ')).trim();
  if (line === '') break;
  changes.push(line);
}
rl.close();

if (changes.length === 0) {
  console.error('need at least one change line — aborting, no changes made.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

// snapshot the exact bytes so we can restore on failure
const pkgSnap = readFileSync(pkgPath, 'utf8');
const clogSnap = readFileSync(changelogPath, 'utf8');

// write the bump + changelog entry
const restore = () => {
  writeFileSync(pkgPath, pkgSnap);
  writeFileSync(changelogPath, clogSnap);
};

try {
  pkg.version = next;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const clog = JSON.parse(clogSnap);
  clog.unshift({ version: next, date: today, component, changes });
  writeFileSync(changelogPath, JSON.stringify(clog, null, 2) + '\n');

  console.log(`\nbumped ${component} → v${next}; changelog updated. Running release…\n`);

  const step = component === 'site'
    ? spawnSync('make', ['_deploy-site'], { cwd: ROOT, stdio: 'inherit', env: process.env })
    : spawnSync('npm', ['publish', '--workspace=@mauricode/token-derby'], { cwd: ROOT, stdio: 'inherit', env: process.env });

  if (step.status !== 0) {
    restore();
    console.error(`\n✗ release step failed (exit ${step.status}). Reverted the version bump and changelog entry — tree is unchanged.`);
    process.exit(1);
  }
} catch (err) {
  restore();
  console.error(`\n✗ release failed: ${err.message}. Reverted the version bump and changelog entry.`);
  process.exit(1);
}

console.log(`\n✓ ${component} v${next} released.`);
if (component === 'cli') {
  console.log('  Note: run `make deploy` to refresh the live site\'s CLI badge + changelog entry.');
}
