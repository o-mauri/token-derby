import { renderOrg } from './render/org.js';
import type { ListOrgRacesResponse } from '@token-derby/shared';

const ORG_NAME = 'PreviewOrg';

const PALETTE = { body: '#8B4513', mane: '#1F1108', tail: '#1F1108', saddle: '#C0392B' };

const FIXTURE: ListOrgRacesResponse = {
  org_name: ORG_NAME,
  races: [
    // Live with a leader + equipped hat.
    {
      race_id: 'r1',
      name: 'Friday Sprint',
      join_code: 'ABC123',
      start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: 'live',
      time_left_seconds: 2 * 60 * 60,
      highlight: {
        horse_name: 'Comet',
        tokens: 1_234_567,
        colors: PALETTE,
        hat: { id: 'stetson', variant: 0, obtained_at: new Date().toISOString() },
      },
    },
    // Live with no highlight (zero-horse race) — no sprite, no leader text.
    {
      race_id: 'r2',
      name: 'Late Night Marathon (empty)',
      join_code: 'DEF456',
      start_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      status: 'live',
      time_left_seconds: 30,
    },
    // Pending.
    {
      race_id: 'r3',
      name: 'Monday Warm-up',
      join_code: 'GHI789',
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
    // Finished with a winner + hat.
    {
      race_id: 'r5',
      name: 'Last Week Showdown',
      join_code: 'MNO345',
      start_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      status: 'finished',
      ended_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
      highlight: {
        horse_name: 'Thunderbolt',
        tokens: 980_421,
        colors: { body: '#2E4057', mane: '#0B1A2A', tail: '#0B1A2A', saddle: '#D4AF37' },
        hat: { id: 'party_hat', variant: 1, obtained_at: new Date().toISOString() },
      },
    },
    // A pile of older finished races so the page scrolls — demonstrates the
    // sticky Live section.
    ...Array.from({ length: 8 }, (_, i): ListOrgRacesResponse['races'][number] => ({
      race_id: `old-${i}`,
      name: `Archive Race #${8 - i}`,
      join_code: `OLD10${i}`,
      start_time: new Date(Date.now() - (20 + i) * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() - (20 + i) * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      status: 'finished',
      ended_at: new Date(Date.now() - (20 + i) * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      highlight: {
        horse_name: ['Blaze', 'Nimbus', 'Pickle', 'Rocket', 'Waffles', 'Zephyr', 'Biscuit', 'Mango'][i]!,
        tokens: 900_000 - i * 87_341,
        colors: PALETTE,
      },
    })),
    // Finished with no highlight — no sprite, no winner text, just the date.
    {
      race_id: 'r6',
      name: 'Pre-launch Demo (no finishers)',
      join_code: 'PQR678',
      start_time: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000).toISOString(),
      status: 'finished',
      ended_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 50 * 60 * 1000).toISOString(),
    },
  ],
};

window.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes(`/api/organisations/${encodeURIComponent(ORG_NAME)}/races`)) {
    return new Response(JSON.stringify(FIXTURE), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.includes(`/api/organisations/${encodeURIComponent(ORG_NAME)}/league/standings`)) {
    const standings = {
      org_name: ORG_NAME, season: 1, round: 4, races_per_season: 8,
      divisions: [
        { division: 1, name: 'Premier', rows: [
          { rank: 1, stable_horse_id: 'a', horse_name: 'Bolt', user_name: 'sam', points: 54, season_tokens: 1_502_338, zone: null },
          { rank: 2, stable_horse_id: 'b', horse_name: 'Ada', user_name: 'omar', points: 47, season_tokens: 1_120_004, zone: null },
          { rank: 3, stable_horse_id: 'c', horse_name: 'Sol', user_name: 'rai', points: 41, season_tokens: 990_210, zone: null },
          { rank: 4, stable_horse_id: 'd', horse_name: 'Vega', user_name: 'lin', points: 30, season_tokens: 610_000, zone: 'relegate' },
          { rank: 5, stable_horse_id: 'e', horse_name: 'Juno', user_name: 'kai', points: 22, season_tokens: 420_000, zone: 'relegate' },
        ] },
        { division: 2, name: 'Championship', rows: [
          { rank: 1, stable_horse_id: 'f', horse_name: 'Oak', user_name: 'bex', points: 40, season_tokens: 700_000, zone: 'promote' },
          { rank: 2, stable_horse_id: 'g', horse_name: 'Pip', user_name: 'dee', points: 33, season_tokens: 560_000, zone: 'promote' },
          { rank: 3, stable_horse_id: 'h', horse_name: 'Fen', user_name: 'mo', points: 29, season_tokens: 480_000, zone: null },
          { rank: 4, stable_horse_id: 'i', horse_name: 'Wren', user_name: 'al', points: 18, season_tokens: 240_000, zone: 'relegate' },
          { rank: 5, stable_horse_id: 'j', horse_name: 'Nyx', user_name: 'rho', points: 11, season_tokens: 90_000, zone: 'relegate' },
        ] },
        { division: 3, name: 'League One', rows: [
          { rank: 1, stable_horse_id: 'k', horse_name: 'Ash', user_name: 'quinn', points: 35, season_tokens: 300_000, zone: 'promote' },
          { rank: 2, stable_horse_id: 'l', horse_name: 'Dot', user_name: 'niaj', points: 28, season_tokens: 210_000, zone: 'promote' },
          { rank: 3, stable_horse_id: 'm', horse_name: 'Kip', user_name: 'peg', points: 20, season_tokens: 120_000, zone: null },
          { rank: 4, stable_horse_id: 'n', horse_name: 'Rue', user_name: 'mal', points: 9, season_tokens: 40_000, zone: null },
        ] },
      ],
    };
    return new Response(JSON.stringify({ standings }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const app = document.getElementById('app')!;
renderOrg(app, ORG_NAME);
