export type Route =
  | { type: 'home' }
  | { type: 'race'; joinCode: string }
  | { type: 'org'; orgName: string }
  | { type: 'org-live'; orgName: string }
  | { type: 'catalog' }
  | { type: 'about' }
  | { type: 'org-manager' }
  | { type: 'not-found' };

export function parseRoute(pathname: string): Route {
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '/') return { type: 'home' };

  const raceMatch = trimmed.match(/^\/race\/([A-Za-z0-9]+)$/);
  if (raceMatch) return { type: 'race', joinCode: raceMatch[1]!.toUpperCase() };

  if (trimmed === '/org-manager') return { type: 'org-manager' };

  const orgLiveMatch = trimmed.match(/^\/org\/([A-Za-z0-9]{1,12})\/live$/);
  if (orgLiveMatch) return { type: 'org-live', orgName: orgLiveMatch[1]! };

  const orgMatch = trimmed.match(/^\/org\/([A-Za-z0-9]{1,12})$/);
  if (orgMatch) return { type: 'org', orgName: orgMatch[1]! };

  if (trimmed === '/catalog') return { type: 'catalog' };

  if (trimmed === '/about') return { type: 'about' };

  return { type: 'not-found' };
}
