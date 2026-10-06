// Read-only views of the release script's own files; scripts/release.mjs is the only writer.
import changelog from '../../../../../../site/src/changelog.json';
import sitePkg from '../../../../../../site/package.json';
import cliPkg from '../../../../../../cli/package.json';

export type ChangelogEntry = { readonly version: string; readonly date: string; readonly component: 'site' | 'cli'; readonly changes: readonly string[] };

export const CHANGELOG = changelog as readonly ChangelogEntry[];
export const SITE_VERSION: string = sitePkg.version;
export const CLI_VERSION: string = cliPkg.version;

/** A release's bullet lines; empty for a release that has none. */
export function changeLines(entry: ChangelogEntry): readonly string[] {
  return entry.changes ?? [];
}
