export const PROD_API_ORIGIN = 'https://api.tokenderby.co.uk';
const PROD_HOST_SUFFIX = '.tokenderby.co.uk';

/** Maps a same-origin `/api/...` path to where the API lives for this page. On
 *  the production hosts that is api.<domain> without the prefix; elsewhere (the
 *  local harnesses, preview pages) it stays same-origin. `/api/auth/*` always
 *  stays same-origin: the Google flow's state cookie must be set there. */
export function apiUrl(path: string, hostname: string = globalThis.location?.hostname ?? ''): string {
  if (!hostname.endsWith(PROD_HOST_SUFFIX)) return path;
  if (!path.startsWith('/api/') || path.startsWith('/api/auth/')) return path;
  return PROD_API_ORIGIN + path.slice('/api'.length);
}
