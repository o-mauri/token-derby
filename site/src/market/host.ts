// Derbymarket lives on its own subdomain. Local harnesses all run on localhost,
// so they opt into market routing with ?host=market.
export const MARKET_ORIGIN = 'https://market.tokenderby.co.uk';
const PROD_SUFFIX = '.tokenderby.co.uk';

export function isMarketHost(hostname: string, search: string): boolean {
  if (hostname.startsWith('market.')) return true;
  if (hostname.endsWith(PROD_SUFFIX)) return false;
  return new URLSearchParams(search).get('host') === 'market';
}

/** A link to a market path that works from any host, including local harnesses. */
export function marketHref(path: string, hostname: string): string {
  if (hostname.endsWith(PROD_SUFFIX)) return hostname.startsWith('market.') ? path : MARKET_ORIGIN + path;
  return `${path}?host=market`;
}

/** Where app…/derbymarket sends a visitor, keeping the sign-in code in the fragment. */
export function derbymarketRedirect(hostname: string, hash: string): string {
  return marketHref('/', hostname) + hash;
}
