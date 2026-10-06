import type { Page } from '@playwright/test';

export type SignedInUser = { user_id?: string; display_name?: string; email?: string };

/** Seeds the keys a real sign-in leaves in localStorage (see site's SESSION_KEYS), valid for 6 more days. */
export async function signIn(page: Page, user: SignedInUser = {}): Promise<void> {
  const seed = {
    td_org_session: 'e2e-token',
    td_org_uid: user.user_id ?? 'u1',
    td_session_name: user.display_name ?? 'Omar',
    td_session_expires: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    ...(user.email !== undefined ? { td_org_linked_email: user.email } : { td_org_linked_email: 'omar@example.com' }),
  };
  await page.addInitScript((s) => {
    // Only on first load, so a sign-out during the test sticks across reloads.
    if (sessionStorage.getItem('e2e-seeded')) return;
    sessionStorage.setItem('e2e-seeded', '1');
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, seed);
}
