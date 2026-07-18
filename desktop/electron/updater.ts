import { gteSemver } from '@token-derby/shared';

export type UpdateCheckResult =
  | { update: true; version: string; url: string; notes?: string }
  | { update: false };

type FeedAsset = { name?: unknown; browser_download_url?: unknown };
type FeedRelease = {
  tag_name?: unknown;
  body?: unknown;
  html_url?: unknown;
  assets?: unknown;
};

export type FetchFeed = () => Promise<unknown>;

// GitHub Releases' `latest` endpoint — the newest non-draft, non-prerelease
// release for the repo. No auth needed for a public repo's read-only feed.
const FEED_URL = 'https://api.github.com/repos/o-mauri/token-derby/releases/latest';

async function defaultFetchFeed(): Promise<unknown> {
  const res = await fetch(FEED_URL, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`update feed request failed: ${res.status}`);
  return res.json();
}

function dmgUrl(release: FeedRelease): string | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const dmg = assets.find((a): a is FeedAsset => {
    if (typeof a !== 'object' || a === null) return false;
    const name = (a as FeedAsset).name;
    return typeof name === 'string' && name.endsWith('.dmg');
  });
  if (dmg && typeof dmg.browser_download_url === 'string') return dmg.browser_download_url;
  // No .dmg asset attached (or feed shape changed) — the release page itself
  // still lets the user find and download the build by hand.
  return typeof release.html_url === 'string' ? release.html_url : null;
}

// Manual update flow for the unsigned build: no code-signing means no
// electron-updater auto-download/apply, so this only checks a version feed
// and hands the renderer a download link. Settings shows "Download vX.Y.Z"
// + release notes, the user clicks through to `openExternal(url)`, downloads
// the .dmg, and drags it to /Applications themselves (re-approving Gatekeeper
// each time, same as the first install). Once builds are signed, swap this
// implementation for electron-updater's seamless background-update flow —
// `checkForUpdate()`'s shape (and the Settings UI built on it) doesn't need
// to change.
export async function checkForUpdate(
  current: string,
  fetchFeed: FetchFeed = defaultFetchFeed,
): Promise<UpdateCheckResult> {
  let release: FeedRelease;
  try {
    const raw = await fetchFeed();
    if (typeof raw !== 'object' || raw === null) return { update: false };
    release = raw as FeedRelease;
  } catch {
    return { update: false };
  }

  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  const version = tag.replace(/^v/, '').trim();
  if (!version) return { update: false };

  // Strictly newer than current — two gteSemver calls rather than
  // reimplementing semver comparison ourselves.
  const isNewer = gteSemver(version, current) && !gteSemver(current, version);
  if (!isNewer) return { update: false };

  const url = dmgUrl(release);
  if (!url) return { update: false };

  const notes = typeof release.body === 'string' ? release.body : undefined;
  return notes ? { update: true, version, url, notes } : { update: true, version, url };
}
