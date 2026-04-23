export type Route =
  | { type: 'home' }
  | { type: 'race'; joinCode: string }
  | { type: 'not-found' };

export function parseRoute(pathname: string): Route {
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '/') return { type: 'home' };

  const match = trimmed.match(/^\/race\/([A-Za-z0-9]+)$/);
  if (match) return { type: 'race', joinCode: match[1]!.toUpperCase() };

  return { type: 'not-found' };
}
