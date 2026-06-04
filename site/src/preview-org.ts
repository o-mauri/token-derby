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
  return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const app = document.getElementById('app')!;
renderOrg(app, ORG_NAME);
