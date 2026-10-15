// Route maps and sign-in for the admin's browser tests.
import type { Page } from '@playwright/test';
import type { AdminClaimRedemptionsResponse, AdminClaimsResponse, AdminOrgsResponse, AdminUsersResponse, CreateClaimResponse, StableHorse } from '@token-derby/shared';
import { ok, type Routes } from '../support/fake-api';

export const USERS: AdminUsersResponse = { users: [
  { user_id: 'u1', display_name: 'Omar', created_at: '2026-05-14T10:00:00Z', email: 'omar@stackone.com', horses: [
    { stable_horse_id: 'h1', name: 'Gallopz', colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' }, created_at: '2026-05-14T10:00:00Z',
      xp: 900, races_entered: 30, wins: 4, podiums: 9, total_tokens: 1_234_000, total_finishing_position: 75,
      hats: [{ id: 'party_hat', obtained_at: '2026-01-02T00:00:00Z' }, { id: 'cowboy_hat', obtained_at: '2026-05-01T00:00:00Z' }], equipped_hat: 1 },
    { stable_horse_id: 'h2', name: 'Comet', colors: { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' }, created_at: '2026-06-01T10:00:00Z',
      xp: 120, races_entered: 4, wins: 0, podiums: 1, total_tokens: 98_000, total_finishing_position: 14, hats: [], equipped_hat: null },
  ] },
  { user_id: 'u2', display_name: 'Dana', created_at: '2026-05-23T10:00:00Z', email: 'dana@stackone.com', horses: [] },
  { user_id: 'u3', display_name: 'Sam', created_at: '2026-06-01T10:00:00Z', horses: [] },
] };

export const ORGS: AdminOrgsResponse = { organisations: [
  { org_id: 'o1', org_name: 'Stackone', created_at: '2026-05-14T10:00:00Z', creator_user_id: 'u1', creator_user_name: 'Omar',
    members: USERS.users.map((u) => ({ user_id: u.user_id, user_name: u.display_name, joined_at: u.created_at })) },
  { org_id: 'o2', org_name: 'NightOwls', created_at: '2026-07-01T10:00:00Z', creator_user_id: 'u2', creator_user_name: 'Dana',
    members: [{ user_id: 'u2', user_name: 'Dana', joined_at: '2026-07-01T10:00:00Z' }] },
] };

export const CLAIMS: AdminClaimsResponse = { claims: [
  { code: 'ABCD1234', item_type: 'hat', entries: [{ hat_id: 'party_hat' }], max_redemptions: 5, redeemed_count: 2, created_at: '2026-10-01T00:00:00Z', expires_at: '2099-11-01T00:00:00Z' },
  { code: 'PACK5678', item_type: 'hat', entries: [{ hat_id: 'party_hat' }, { hat_id: 'flat_cap' }], max_redemptions: 1, redeemed_count: 1, created_at: '2026-09-01T00:00:00Z', expires_at: '2099-11-01T00:00:00Z' },
] };

/** Every list endpoint the signed-in admin loads. */
export function adminRoutes(): Routes {
  const horse = USERS.users[0]!.horses[0]!;
  return {
    'GET /api/admin/users': ok<AdminUsersResponse>(USERS),
    'GET /api/admin/organisations': ok<AdminOrgsResponse>(ORGS),
    'GET /api/admin/claims': ok<AdminClaimsResponse>(CLAIMS),
    'GET /api/admin/claims/ABCD1234/redemptions': ok<AdminClaimRedemptionsResponse>({ redemptions: [{ user_id: 'u1', user_name: 'Omar', horse_id: 'h1', horse_name: 'Gallopz', redeemed_at: '2026-10-02T00:00:00Z', outcome: 'hat', hat_id: 'party_hat' }, { user_id: 'u2', user_name: 'Dana', horse_id: 'h9', horse_name: 'Comet', redeemed_at: '2026-10-03T00:00:00Z', outcome: 'duplicate', hat_id: 'party_hat', xp_awarded: 50 }] }),
    'PUT /api/admin/users/u1': (req) => ok<{ user_id: string; display_name: string }>({ user_id: 'u1', display_name: (req.body as { display_name: string }).display_name }),
    'DELETE /api/admin/users/u1/horses/h1/hats/1': ok<StableHorse>({ ...horse, hats: [horse.hats![0]!], equipped_hat: null }),
    'POST /api/admin/claims': (req) => ok<CreateClaimResponse>({ code: 'NEWC0DE1', item_type: 'hat', entries: (req.body as { entries: CreateClaimResponse['entries'] }).entries, max_redemptions: 1, expires_at: '2026-11-05T00:00:00Z' }),
  };
}

/** Seeds the admin token a real sign-in leaves, before the page loads. */
export async function adminSignIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-admin-seeded')) return;
    sessionStorage.setItem('e2e-admin-seeded', '1');
    localStorage.setItem('td_admin_token', 'e2e-admin');
    localStorage.setItem('td_admin_expires', new Date(Date.now() + 3_600_000).toISOString());
  });
}
