// The v2 opt-in: a cookie the edge reads to serve the v2 build, and a one-time prompt flag.

export const SITE_COOKIE = 'td_site';
export const PROMPT_KEY = 'td_v2_prompt';
const YEAR_SECONDS = 31_536_000;

const V2_ONLY: readonly RegExp[] = [
  /^\/paddock$/, /^\/account(\/devices)?$/, /^\/org\/[^/]+\/(races|league|settings(\/.*)?)$/,
  /^\/catalog\/[^/]+$/, /^\/link-google$/,
];

export function isV2(doc: Document): boolean {
  return /(?:^|;\s*)td_site=v2(?:;|$)/.test(doc.cookie);
}

/** Opts in and reloads the same page, which the edge then serves from v2. Drops the hash so a sign-in code isn't replayed. */
export function chooseV2(doc: Document, go: (url: string) => void = (url) => window.location.replace(url)): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  doc.cookie = `${SITE_COOKIE}=v2; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secure}`;
  if (isV2(doc)) go(window.location.pathname + window.location.search);
}

export function promptDone(storage: Storage | null = safeLocalStorage()): boolean {
  try { return storage?.getItem(PROMPT_KEY) === 'done'; } catch { return false; }
}

export function markPromptDone(storage: Storage | null = safeLocalStorage()): void {
  try { storage?.setItem(PROMPT_KEY, 'done'); } catch { /* blocked storage: the prompt returns next visit */ }
}

export function isV2OnlyPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return V2_ONLY.some((re) => re.test(p));
}

function safeLocalStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}
