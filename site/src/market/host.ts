// Derbymarket lives on its own subdomain. Local harnesses all run on localhost,
// so they opt into market routing with ?host=market.
export const MARKET_ORIGIN = 'https://market.tokenderby.co.uk';
const APEX = 'tokenderby.co.uk';
const MARKET_HOST = `market.${APEX}`;
const isProd = (hostname: string) => hostname === APEX || hostname.endsWith(`.${APEX}`);

export function isMarketHost(hostname: string, search: string): boolean {
  if (hostname === MARKET_HOST) return true;
  if (isProd(hostname)) return false;
  return new URLSearchParams(search).get('host') === 'market';
}

/** A link to a market path that works from any host, including local harnesses. */
export function marketHref(path: string, hostname: string): string {
  if (isProd(hostname)) return hostname === MARKET_HOST ? path : MARKET_ORIGIN + path;
  return `${path}?host=market`;
}

/** Where app…/derbymarket sends a visitor, keeping the sign-in code in the fragment. */
export function derbymarketRedirect(hostname: string, hash: string): string {
  return marketHref('/', hostname) + hash;
}
