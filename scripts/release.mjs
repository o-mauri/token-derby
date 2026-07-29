#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { bumpVersion, resolveBump } from './release-lib.mjs';
import { announce } from './announce.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const component = process.argv[2];
if (component !== 'site' && component !== 'cli') {
  console.error('usage: release.mjs <site|cli>');
  process.exit(1);
}

const pkgPath = resolve(ROOT, component === 'site' ? 'site/package.json' : 'cli/package.json');
const changelogPath = resolve(ROOT, 'site/src/changelog.json');

const rl = createInterface({ input, output });

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const current = pkg.version;
console.log(`\n${component} is at v${current}`);
const noneOption = component === 'site' ? '    none → no version change' : '';
console.log(`  patch → ${bumpVersion(current, 'patch')}    minor → ${bumpVersion(current, 'minor')}    major → ${bumpVersion(current, 'major')}${noneOption}`);

const decision = resolveBump(component, current, await rl.question('bump [patch/minor/major/none]: '));
if (decision.action === 'reject') {
  console.error(decision.reason);
  rl.close();
  process.exit(1);
}

// No version change: nothing to write, nothing to announce, nothing to roll back.
if (decision.action === 'none') {
  rl.close();
  console.log('\nno version bump — skipping changelog. Running deploy…\n');
  const step = spawnSync('make', ['_deploy-site'], { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (step.status !== 0) {
    console.error(`\n✗ deploy failed (exit ${step.status}). No files were changed.`);
    process.exit(1);
  }
  console.log('\n✓ site deployed (version unchanged).');
  process.exit(0);
}

const next = decision.version;

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

// Best-effort, and deliberately outside the try/restore block above: the
// publish already happened, so a Slack failure must never revert the bump.
try {
  const res = await announce(component, next);
  if (res.announced) console.log(`  Slack: announced to ${res.orgs_notified} org(s).`);
  else console.log('  Slack: every opted-in org already has this release — nothing left to send.');
} catch (e) {
  console.warn(`  ⚠ Slack announcement failed: ${e.message}`);
  console.warn(`     retry with: make announce-release COMPONENT=${component} VERSION=${next}`);
}

if (component === 'cli') {
  console.log('  Note: run `make deploy` to refresh the live site\'s CLI badge + changelog entry.');
}
