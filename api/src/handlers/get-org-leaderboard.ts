import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { GetOrgLeaderboardResponse, LeaderboardEntry } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName, listOrgMembers } from '../db/organisations.js';
import { listStableHorses } from '../db/stable.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);

  const members = await listOrgMembers(org.org_id);

  // Fan out the per-member stable lookups concurrently (same pattern as finalise-race.ts).
  // owner_name is the member's display name as snapshot in the org membership record at
  // join time — it can lag a later rename, consistent with the rest of the codebase.
  const perMember = await Promise.all(
    members.map(async (member) => {
      const horses = await listStableHorses(member.user_id);
      return horses.map((h): LeaderboardEntry => ({
        name: h.name,
        owner_name: member.user_name,
        wins: h.wins ?? 0,
        podiums: h.podiums ?? 0,
        xp: h.xp ?? 0,
        races_entered: h.races_entered ?? 0,
      }));
    }),
  );
  const entries: LeaderboardEntry[] = perMember.flat();

  entries.sort((a, b) => b.xp - a.xp);

  const response: GetOrgLeaderboardResponse = { org_name: org.org_name, horses: entries };
  return ok(response);
};
