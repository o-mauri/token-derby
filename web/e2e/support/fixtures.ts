// Route maps for fakeApi, built from the site's preview fixtures so tests and /preview-* pages share data.
import type { DeviceRecord, DivisionConfig, GetOrganisationResponse, League, ListDevicesResponse, ListOrganisationsResponse, OrgMembersResponse } from '@token-derby/shared';
import { PREVIEW_ORG, previewLiveRace, previewOrgRaces, previewOrgStandings, type OrgPreviewOptions } from '../../projects/site/src/app/preview/org-fixture';
import { PREVIEW_JOIN_CODE, PREVIEW_SERIES, previewRace, type PreviewRaceState } from '../../projects/site/src/app/preview/race-fixture';
import type { Routes } from './fake-api';

export { PREVIEW_JOIN_CODE, PREVIEW_ORG };

export const notFound = (code: string, message = 'Not found') => ({ status: 404, body: { code, message } });

export function myOrgs(names: string[] = ['Stackone', 'acme', 'NightOwls']): Routes {
  const body: ListOrganisationsResponse = { organisations: names.map((org_name, i) => ({ org_id: `o${i}`, org_name })) };
  return { 'GET /api/organisations': { body } };
}

/** The public org pages (dashboard, races, league) for `PREVIEW_ORG`, with a live race by default. */
export function orgRoutes(opts: Partial<OrgPreviewOptions> = {}): Routes {
  const o: OrgPreviewOptions = { state: 'live', league: true, long: false, ...opts };
  const base = `/api/organisations/${PREVIEW_ORG}`;
  return {
    [`GET ${base}/races`]: { body: previewOrgRaces(o) },
    [`GET ${base}/league/standings`]: { body: { standings: previewOrgStandings(o) } },
    [`GET /api/races/${PREVIEW_JOIN_CODE}`]: { body: previewLiveRace(o) },
    [`GET /api/races/${PREVIEW_JOIN_CODE}/series`]: { body: PREVIEW_SERIES },
  };
}

/** One race at `PREVIEW_JOIN_CODE` in the given state. */
export function raceRoutes(state: PreviewRaceState): Routes {
  return {
    [`GET /api/races/${PREVIEW_JOIN_CODE}`]: { body: previewRace(state) },
    [`GET /api/races/${PREVIEW_JOIN_CODE}/series`]: { body: PREVIEW_SERIES },
  };
}

/** The org record; `owner` decides whether the signed-in test user (u1) created it. */
export function orgRecord(owner = true): GetOrganisationResponse {
  return {
    org_id: 'o1', org_name: PREVIEW_ORG, org_join_token: 'td_join_9fA3q7Kd2', created_at: '2026-05-14T10:00:00Z',
    creator_user_id: owner ? 'u1' : 'u9', creator_user_name: 'Omar',
    access: { allowed_domains: ['stackone.com'], join_token_enabled: true, domain_join_enabled: true, restrict_to_allowed_domains: false },
  };
}

/** The org pages as a signed-in member sees them: the public routes plus the org record. */
export function memberOrgRoutes(owner = true): Routes {
  return { ...orgRoutes(), [`GET /api/organisations/${PREVIEW_ORG}`]: { body: orgRecord(owner) } };
}

const members: OrgMembersResponse = { members: [
  { user_id: 'u1', user_name: 'Omar', joined_at: '2026-05-14T10:00:00Z', linked_email: true, matches_domain: 'yes' },
  { user_id: 'u2', user_name: 'Dana', joined_at: '2026-05-23T10:00:00Z', linked_email: true, matches_domain: 'no' },
  { user_id: 'u3', user_name: 'Sam', joined_at: '2026-06-01T10:00:00Z', linked_email: false, matches_domain: 'n/a' },
] };
const divisions: DivisionConfig[] = [{ name: 'Premier', cap: 8 }, { name: 'Championship', cap: 8 }];
const league = {
  weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'Europe/London', race_name: 'Daily Derby', max_participants: 20,
  org_id: 'o1', created_at: '2026-05-14T10:00:00Z', creator_user_id: 'u1', creator_user_name: 'Omar',
  divisions, boundaries: [2], races_per_season: 10, current_season: 3, status: 'active',
} as League;

/** Every org settings endpoint, as an owner with a running league and nothing else configured. */
export function settingsRoutes(owner = true): Routes {
  const base = `/api/organisations/${PREVIEW_ORG}`;
  return {
    ...memberOrgRoutes(owner),
    [`GET ${base}/members`]: { body: members },
    [`GET ${base}/schedule`]: { body: { schedule: null } },
    [`GET ${base}/league`]: { body: { league } },
    [`GET ${base}/race-settings`]: { body: { settings: null } },
    [`PUT ${base}/race-settings`]: (req) => ({ body: { settings: { org_id: 'o1', ...(req.body as object), updated_at: '', updated_by_user_id: 'u1' } } }),
    [`GET ${base}/webhook`]: { body: { webhook_url: null } },
    [`GET ${base}/slack`]: { body: { configured: false, channel_id: null, messages: null, digest: null } },
  };
}

export const DEVICES: DeviceRecord[] = [
  { device_id: 'd1', label: 'omar-mbp', created_at: '2026-09-12T10:00:00Z', last_seen_at: '2026-10-06T11:58:00Z' },
  { device_id: 'd2', label: 'old-laptop', created_at: '2026-08-01T10:00:00Z', last_seen_at: '2026-09-01T10:00:00Z' },
];

/** The account page's endpoints: devices, rename and both sign-outs, plus home's orgs list to land on. */
export function accountRoutes(): Routes {
  const devices: ListDevicesResponse = { devices: DEVICES, has_legacy_credential: false };
  return {
    ...myOrgs(),
    'GET /api/devices': { body: devices },
    'DELETE /api/devices/d2': { status: 204 },
    'PUT /api/jockey/me': (req) => ({ body: { user_id: 'u1', display_name: (req.body as { display_name: string }).display_name } }),
    'DELETE /api/web-sessions': { status: 204 },
    'DELETE /api/web-sessions/all': { body: { signed_out: 2 } },
  };
}
