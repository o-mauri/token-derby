import type { ApiHandler } from '../lib/http.js';
import type { OrgMembersResponse } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName, isMember, listOrgMembers } from '../db/organisations.js';
import { getUserLinkageByIds } from '../db/users.js';
import { hasLinkedEmail, provenDomains } from '../lib/user-domains.js';
import { ok, err } from '../lib/http.js';
import { resolveCaller } from '../lib/auth.js';

export const handler: ApiHandler = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (!(await isMember(org.org_id, auth.user_id))) {
    return err('NOT_ORG_MEMBER', 'You are not a member of this organisation');
  }

  const members = await listOrgMembers(org.org_id);

  // Linked-email and domain-match are owner-only disclosures — a non-owner
  // gets no linkage/domain keys on their member rows at all, not merely a
  // client-hidden column. This is the server-side gate; the UI just renders
  // whatever it is given.
  const isOwner = org.creator_user_id === auth.user_id;
  if (!isOwner) {
    const response: OrgMembersResponse = { members };
    return ok(response);
  }

  const linkage = await getUserLinkageByIds(members.map((m) => m.user_id));
  const allowed_domains = org.allowed_domains;
  const enriched = members.map((m) => {
    const info = linkage.get(m.user_id) ?? null;
    const linked_email = hasLinkedEmail(info);
    const matches_domain: 'yes' | 'no' | 'n/a' =
      allowed_domains.length === 0 || !linked_email
        ? 'n/a'
        : [...provenDomains(info)].some((d) => allowed_domains.includes(d))
          ? 'yes'
          : 'no';
    return { ...m, linked_email, matches_domain };
  });
  const response: OrgMembersResponse = { members: enriched };
  return ok(response);
};
