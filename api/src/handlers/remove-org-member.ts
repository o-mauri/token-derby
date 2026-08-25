import type { ApiHandler } from '../lib/http.js';
import type { RemoveOrgMemberResponse } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName, removeMember } from '../db/organisations.js';
import { ok, err } from '../lib/http.js';
import { resolveCaller } from '../lib/auth.js';

// Owner-only, hard delete of the MEMBER# row — see removeMember for why a
// flag was rejected. The creator can never be the target: losing the only
// owner would make the org permanently unmanageable with no path back short
// of an admin, so that check applies even when the owner targets themselves.
export const handler: ApiHandler = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const rawOrgName = event.pathParameters?.org_name;
  if (!rawOrgName) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(rawOrgName);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const rawUserId = event.pathParameters?.user_id;
  if (!rawUserId) return err('BAD_REQUEST', 'user_id path parameter required');
  const user_id = decodeURIComponent(rawUserId);

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (org.creator_user_id !== auth.user_id) {
    return err('NOT_ORG_OWNER', 'Only the organisation creator can remove members');
  }
  if (user_id === org.creator_user_id) {
    return err('CANNOT_REMOVE_OWNER', 'The organisation creator cannot be removed');
  }

  const removed = await removeMember(org.org_id, user_id);
  if (!removed) return err('USER_NOT_FOUND', 'That user is not a member of this organisation');

  const response: RemoveOrgMemberResponse = { ok: true };
  return ok(response);
};
