import type { ApiHandler } from '../lib/http.js';
import type { OrgMembersResponse } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName, isMember, listOrgMembers } from '../db/organisations.js';
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
  const response: OrgMembersResponse = { members };
  return ok(response);
};
