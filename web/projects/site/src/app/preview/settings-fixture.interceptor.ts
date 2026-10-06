import { DOCUMENT, inject } from '@angular/core';
import { HttpErrorResponse, HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import type { DivisionConfig, GetOrganisationResponse, League, OrgMembersResponse, RaceSchedule } from '@token-derby/shared';
import { PREVIEW_ORG } from './org-fixture';

const query = () => new URLSearchParams(inject(DOCUMENT).defaultView?.location.search ?? '');
const DAY = 86_400_000;

function org(): GetOrganisationResponse {
  return {
    org_id: 'o1', org_name: PREVIEW_ORG, org_join_token: 'td_join_9fA3q7Kd2', created_at: '2026-05-14T10:00:00Z',
    creator_user_id: query().get('owner') === 'no' ? 'u9' : 'u1', creator_user_name: 'Omar',
    access: { allowed_domains: ['stackone.com', 'stackone.co.uk'], join_token_enabled: true, domain_join_enabled: true, restrict_to_allowed_domains: false },
  };
}

function members(): OrgMembersResponse {
  const names = ['Omar', 'Dana', 'Sam', 'Kit', 'Lee', 'Jo'];
  const match = ['yes', 'yes', 'no', 'yes', 'n/a', 'yes'] as const;
  return { members: names.map((user_name, i) => ({
    user_id: `u${i + 1}`, user_name, joined_at: new Date(Date.UTC(2026, 4, 14) + i * 9 * DAY).toISOString(),
    linked_email: match[i] !== 'n/a', matches_domain: match[i],
  })) };
}

const base = { weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'Europe/London', race_name: 'Daily Derby', max_participants: 20 };
const stamp = { org_id: 'o1', created_at: '2026-05-14T10:00:00Z', creator_user_id: 'u1', creator_user_name: 'Omar' };
const divisions: DivisionConfig[] = [{ name: 'Premier', cap: 8 }, { name: 'Championship', cap: 8 }, { name: 'League One', cap: 8 }];

function schedule(): RaceSchedule | null {
  return query().get('mode') === 'schedule' ? { ...base, ...stamp } as RaceSchedule : null;
}

function league(): League | null {
  if (query().get('mode') !== 'league') return null;
  return { ...base, ...stamp, divisions, boundaries: [2, 2], races_per_season: 10, current_season: 3, status: query().has('running') ? 'active' : 'active' } as League;
}

/** Answers the org settings endpoints from fixtures. ?owner=no, ?mode=off|schedule|league, &slack, &webhook and &errors pick the variant. */
export const settingsFixtureInterceptor: HttpInterceptorFn = (req, next) => {
  const prefix = `/api/organisations/${PREVIEW_ORG}`;
  if (!req.url.startsWith(prefix)) return next(req);
  const path = req.url.slice(prefix.length);
  const q = query();
  const ok = (body: unknown) => of(new HttpResponse({ status: 200, body }));
  const fail = (status: number, code: string, message = 'preview') => throwError(() => new HttpErrorResponse({ status, error: { code, message }, url: req.url }));
  if (q.has('errors') && req.method !== 'GET') return fail(400, 'BAD_REQUEST', 'Preview error: the server refused this change.');
  const m = req.method;
  if (path === '' && m === 'GET') return ok(org());
  if (path === '/members' && m === 'GET') return ok(members());
  if (path.startsWith('/members/') && m === 'DELETE') return ok({ ok: true });
  if (path === '/access' && m === 'PUT') return ok({ access: req.body });
  if (path === '/join-token/rotate') return ok({ org_join_token: 'td_join_N3wT0k3n9' });
  if (path === '/schedule') return m === 'GET' ? ok({ schedule: schedule() }) : m === 'PUT' ? ok({ schedule: { ...(req.body as object), ...stamp } }) : ok({ ok: true });
  if (path === '/league') return m === 'GET' ? ok({ league: league() }) : m === 'PUT' ? ok({ league: { ...(req.body as object), ...stamp } }) : ok({ ok: true });
  if (path === '/race-settings') return m === 'GET' ? ok({ settings: null }) : ok({ settings: { org_id: 'o1', ...(req.body as object), updated_at: '', updated_by_user_id: 'u1' } });
  if (path === '/webhook') {
    if (m === 'GET') return ok({ webhook_url: q.has('webhook') ? 'https://hooks.example.com/token-derby' : null });
    return m === 'PUT' ? ok({ webhook_url: (req.body as { url: string }).url, webhook_secret: 'whsec_preview_4f9a2c' }) : ok({ ok: true });
  }
  if (path === '/slack') {
    if (m === 'GET') return ok(q.has('slack')
      ? { configured: true, channel_id: 'C0RACING', messages: { race_created: true, race_ended: true, league_season_ended: true, weekly_digest: true, release_published: false }, digest: { weekday: 5, time_local: '15:00', tz: 'Europe/London' } }
      : { configured: false, channel_id: null, messages: null, digest: null });
    return ok({ ok: true });
  }
  return next(req);
};
