const SESSION_KEY = 'td_org_session';
const UID_KEY = 'td_org_uid';
const LINKED_EMAIL_KEY = 'td_org_linked_email';

export function getSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setSession(token: string): void {
  localStorage.setItem(SESSION_KEY, token);
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  clearUid();
  clearLinkedEmail();
}

/** The signed-in user's id, set at code-exchange time. Backed by localStorage
 *  (not sessionStorage) so it survives reopening /org-manager in a new tab,
 *  matching the lifetime of the session token itself. */
export function getUid(): string | null {
  return localStorage.getItem(UID_KEY);
}

export function setUid(id: string): void {
  localStorage.setItem(UID_KEY, id);
}

export function clearUid(): void {
  localStorage.removeItem(UID_KEY);
}

/** The signed-in user's linked Google email, set at code-exchange time when
 *  present. Backed by localStorage for the same reason as `getUid`/`setUid`. */
export function getLinkedEmail(): string | null {
  return localStorage.getItem(LINKED_EMAIL_KEY);
}

export function setLinkedEmail(email: string): void {
  localStorage.setItem(LINKED_EMAIL_KEY, email);
}

export function clearLinkedEmail(): void {
  localStorage.removeItem(LINKED_EMAIL_KEY);
}

/** Reads `#code=<code>` from the URL fragment and wipes the fragment. */
export function readCodeFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const code = params.get('code');
  if (!code) return null;
  // Wipe the fragment so the one-time code never lingers in history/back-nav.
  history.replaceState(null, '', window.location.pathname + window.location.search);
  window.location.hash = '';
  return code;
}
