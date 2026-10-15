import type { AdminOrg, AdminUser } from '@token-derby/shared';

export const USERS: AdminUser[] = [
  { user_id: 'u1', display_name: 'Omar', created_at: '2026-05-14T10:00:00Z', email: 'omar@stackone.com', horses: [
    { stable_horse_id: 'h1', name: 'Gallopz', colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' }, created_at: '2026-05-14T10:00:00Z',
      xp: 900, races_entered: 30, wins: 4, podiums: 9, total_tokens: 1_234_000, total_finishing_position: 75,
      hats: [{ id: 'party_hat', obtained_at: '2026-01-02T00:00:00Z' }, { id: 'cowboy_hat', obtained_at: '2026-05-01T00:00:00Z' }], equipped_hat: 1 },
  ] },
  { user_id: 'u2', display_name: 'dana', created_at: '2026-05-23T10:00:00Z', horses: [] },
];

export const ORGS: AdminOrg[] = [
  { org_id: 'o1', org_name: 'Stackone', created_at: '2026-05-14T10:00:00Z', creator_user_id: 'u1', creator_user_name: 'Omar',
    members: [{ user_id: 'u1', user_name: 'Omar', joined_at: '2026-05-14T10:00:00Z' }, { user_id: 'u2', user_name: 'dana', joined_at: '2026-05-23T10:00:00Z' }] },
];
