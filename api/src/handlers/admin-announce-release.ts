import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { AnnounceReleaseRequest, AnnounceReleaseResponse, ReleaseComponent } from '@token-derby/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { claimRelease } from '../db/releases.js';
import { listOrgsWithSlackRelease } from '../db/organisations.js';
import { sendOrgRelease } from '../lib/slack/send.js';
import { ok, err, parseJson } from '../lib/http.js';

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CHANGES = 20;

function validComponent(c: any): c is ReleaseComponent {
  return c === 'cli' || c === 'site';
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cfg = await loadAdminConfig();
  const auth = requireAdmin(event, cfg.sessionSecret);
  if (!auth.ok) return err('UNAUTHENTICATED', 'Admin session required');

  const body = parseJson<AnnounceReleaseRequest>(event.body);
  if (!body) return err('BAD_REQUEST', 'JSON body required');
  if (!validComponent(body.component)) return err('BAD_REQUEST', "component must be 'cli' or 'site'");
  if (typeof body.version !== 'string' || !VERSION_RE.test(body.version)) return err('BAD_REQUEST', 'version must be x.y.z');
  if (typeof body.date !== 'string' || !DATE_RE.test(body.date)) return err('BAD_REQUEST', 'date must be YYYY-MM-DD');
  if (!Array.isArray(body.changes) || body.changes.length === 0 || body.changes.length > MAX_CHANGES
      || body.changes.some((c) => typeof c !== 'string' || c.trim() === '')) {
    return err('BAD_REQUEST', `changes must be 1-${MAX_CHANGES} non-empty strings`);
  }

  const release: AnnounceReleaseRequest = {
    component: body.component,
    version: body.version,
    date: body.date,
    changes: body.changes.map((c) => c.trim()),
  };

  // At-most-once: a retried release claims nothing and posts nothing.
  if (!(await claimRelease(release))) {
    const dup: AnnounceReleaseResponse = { announced: false, reason: 'duplicate' };
    return ok(dup);
  }

  const orgs = await listOrgsWithSlackRelease();
  let orgs_notified = 0;
  for (const org of orgs) {
    if (await sendOrgRelease(org, release)) orgs_notified += 1;
  }

  const response: AnnounceReleaseResponse = { announced: true, orgs_notified };
  return ok(response);
};
