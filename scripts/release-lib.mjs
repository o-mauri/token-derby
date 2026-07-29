// Pure helpers extracted from release.mjs so the decisions are testable
// without driving the interactive prompts.

export function bumpVersion(current, kind) {
  const [maj, min, pat] = current.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

const CLI_NONE_REASON =
  'cannot publish the CLI without a version bump — npm will not accept a duplicate version';

/** → { action: 'bump', version } | { action: 'none' } | { action: 'reject', reason } */
export function resolveBump(component, current, answer) {
  const kind = String(answer ?? '').trim().toLowerCase();
  if (kind === 'patch' || kind === 'minor' || kind === 'major') {
    return { action: 'bump', version: bumpVersion(current, kind) };
  }
  if (kind === 'none') {
    if (component === 'cli') return { action: 'reject', reason: CLI_NONE_REASON };
    return { action: 'none' };
  }
  return { action: 'reject', reason: 'invalid bump type — aborting, no changes made.' };
}

export function findChangelogEntry(changelog, component, version) {
  const entry = changelog.find((e) => e.component === component && e.version === version);
  if (!entry) {
    throw new Error(`no changelog entry for ${component} v${version} — add one to site/src/changelog.json`);
  }
  return entry;
}
