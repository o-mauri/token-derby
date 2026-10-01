import { isMarketHost } from './market/host.js';

export type Route =
  | { type: 'home' }
  | { type: 'race'; joinCode: string }
  | { type: 'org'; orgName: string }
  | { type: 'org-live'; orgName: string }
  | { type: 'catalog' }
  | { type: 'about' }
  | { type: 'privacy' }
  | { type: 'org-manager' }
  | { type: 'derbymarket' }
  | { type: 'market'; market: MarketRoute }
  | { type: 'cli' }
  | { type: 'link' }
  | { type: 'not-found' };

export type MarketRoute =
  | { type: 'picker' }
  | { type: 'org'; orgName: string }
  | { type: 'race'; orgName: string; joinCode: string }
  | { type: 'not-found' };

export function parseMarketRoute(pathname: string): MarketRoute {
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === '') return { type: 'picker' };
  const m = trimmed.match(/^\/([A-Za-z0-9]{1,12})(?:\/([A-Za-z0-9]+))?$/);
  if (!m) return { type: 'not-found' };
  return m[2]
    ? { type: 'race', orgName: m[1]!, joinCode: m[2].toUpperCase() }
    : { type: 'org', orgName: m[1]! };
}

export function parseRoute(pathname: string, hostname = '', search = ''): Route {
  if (isMarketHost(hostname, search)) return { type: 'market', market: parseMarketRoute(pathname) };
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '/') return { type: 'home' };

  const raceMatch = trimmed.match(/^\/race\/([A-Za-z0-9]+)$/);
  if (raceMatch) return { type: 'race', joinCode: raceMatch[1]!.toUpperCase() };

  if (trimmed === '/org-manager') return { type: 'org-manager' };

  if (trimmed === '/derbymarket') return { type: 'derbymarket' };
  if (trimmed === '/cli') return { type: 'cli' };

  if (trimmed === '/link') return { type: 'link' };

  const orgLiveMatch = trimmed.match(/^\/org\/([A-Za-z0-9]{1,12})\/live$/);
  if (orgLiveMatch) return { type: 'org-live', orgName: orgLiveMatch[1]! };

  const orgMatch = trimmed.match(/^\/org\/([A-Za-z0-9]{1,12})$/);
  if (orgMatch) return { type: 'org', orgName: orgMatch[1]! };

  if (trimmed === '/catalog') return { type: 'catalog' };

  if (trimmed === '/about') return { type: 'about' };

  if (trimmed === '/privacy') return { type: 'privacy' };

  return { type: 'not-found' };
}
