import type {
  AdminUsersResponse, AdminOrgsResponse, AdminClaimsResponse, AdminClaimRedemptionsResponse,
} from '@token-derby/shared';
import { renderDashboard } from './render/dashboard.js';

const users: AdminUsersResponse = {
  users: [
    {
      user_id: 'u1', display_name: 'omar', created_at: '2026-04-21T00:00:00Z',
      horses: [
        { stable_horse_id: 'a', name: 'Thunderbolt', colors: { body: '#c0392b', mane: '#000', tail: '#000', saddle: '#fff' }, created_at: '2026-04-01T00:00:00Z', xp: 2100, races_entered: 14, wins: 6, podiums: 10, total_tokens: 1_900_000, total_finishing_position: 30, hats: [{ id: 'h1', obtained_at: 'x' }, { id: 'h2', obtained_at: 'x' }] },
        { stable_horse_id: 'b', name: 'Blue Streak', colors: { body: '#2980b9', mane: '#000', tail: '#000', saddle: '#fff' }, created_at: '2026-04-02T00:00:00Z', xp: 1100, races_entered: 9, wins: 4, podiums: 6, total_tokens: 1_100_000, total_finishing_position: 25 },
      ],
    },
    { user_id: 'u2', display_name: 'alex', created_at: '2026-05-02T00:00:00Z', horses: [] },
  ],
};
const organisations: AdminOrgsResponse = {
  organisations: [
    { org_id: 'o1', org_name: 'StackOne', created_at: '2026-04-22T00:00:00Z', creator_user_id: 'u1', creator_user_name: 'omar', members: [{ user_id: 'u1', user_name: 'omar', joined_at: 'x' }, { user_id: 'u2', user_name: 'alex', joined_at: 'x' }] },
  ],
};
const claims: AdminClaimsResponse = {
  claims: [
    {
      code: 'ABCDEFGHJKLM', item_type: 'hat',
      entries: [{ hat_id: 'flat_cap', variant: 0 }],
      max_redemptions: 1, redeemed_count: 0,
      created_at: '2026-08-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
    },
    {
      code: 'MLKJHGFEDCBA', item_type: 'hat',
      entries: [{ hat_id: 'flat_cap', variant: 0 }, { hat_id: 'bicorne' }],
      max_redemptions: 10, redeemed_count: 3,
      created_at: '2026-08-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
    },
  ],
};

const redemptions: Record<string, AdminClaimRedemptionsResponse> = {
  MLKJHGFEDCBA: {
    redemptions: [
      { user_id: 'u2', user_name: 'alex', horse_id: 'b', horse_name: 'Blue Streak', redeemed_at: '2026-08-02T00:00:00Z', outcome: 'hat', hat_id: 'bicorne', variant: 0 },
      { user_id: 'u3', user_name: 'sam', horse_id: 'c', horse_name: 'Nightshade', redeemed_at: '2026-08-03T00:00:00Z', outcome: 'hat', hat_id: 'flat_cap', variant: 0 },
      { user_id: 'u4', user_name: 'jo', horse_id: 'd', horse_name: 'Comet', redeemed_at: '2026-08-04T00:00:00Z', outcome: 'duplicate', hat_id: 'flat_cap', variant: 0, xp_awarded: 50 },
    ],
  },
};

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  renderDashboard(root, {
    fetchUsers: async () => users,
    fetchOrganisations: async () => organisations,
    fetchClaims: async () => claims,
    createClaim: async (body) => ({
      code: 'AAAABBBBCCCC', item_type: 'hat',
      entries: body.entries ?? [],
      max_redemptions: body.max_redemptions ?? 1,
      expires_at: '2099-01-01T00:00:00Z',
    }),
    fetchRedemptions: async (code) => redemptions[code] ?? { redemptions: [] },
    mutations: {
      renameUser: async (id, name) => ({ user_id: id, display_name: name }),
      renameHorse: async (_u, hid, name) => ({ ...users.users[0].horses[0], stable_horse_id: hid, name }),
      removeHat: async (_u, hid) => ({ ...users.users[0].horses[0], stable_horse_id: hid, hats: [], equipped_hat: undefined }),
      deleteHorse: async () => {},
    },
    onSignOut: () => alert('sign out (preview)'),
    onUnauthorized: () => {},
  });
}
