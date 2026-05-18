import { renderOrg } from './render/org.js';
import type { ListOrgRacesResponse } from '@token-derby/shared';

const ORG_NAME = 'PreviewOrg';

const FIXTURE: ListOrgRacesResponse = {
  org_name: ORG_NAME,
  races: [
    {
      race_id: 'r1',
      name: 'Friday Sprint',
      join_code: 'ABC123',
      start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: 'live',
    },
    {
      race_id: 'r2',
      name: 'Late Night Marathon',
      join_code: 'DEF456',
      start_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      status: 'live',
    },
    {
      race_id: 'r3',
      name: 'Monday Warm-up',
      join_code: 'GHI789',
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
    {
      race_id: 'r4',
      name: 'Quarterly Grand Prix',
      join_code: 'JKL012',
      start_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
    {
      race_id: 'r5',
      name: 'Last Week Showdown',
      join_code: 'MNO345',
      start_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      status: 'finished',
      ended_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
    },
    {
      race_id: 'r6',
      name: 'Pre-launch Demo',
      join_code: 'PQR678',
      start_time: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000).toISOString(),
      status: 'finished',
      ended_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 50 * 60 * 1000).toISOString(),
    },
    {
      race_id: 'r7',
      name: 'New Year Derby',
      join_code: 'STU901',
      start_time: '2026-01-01T10:00:00Z',
      end_time: '2026-01-01T14:00:00Z',
      status: 'finished',
      ended_at: '2026-01-01T14:00:00Z',
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
