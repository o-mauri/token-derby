import type { GetOrgLeaderboardResponse, LeaderboardEntry } from '@token-derby/shared';
import { listOrgMembers } from '../db/organisations.js';
import { listStableHorses } from '../db/stable.js';

// Fan out the per-member stable lookups concurrently (same pattern as finalise-race.ts).
// owner_name is the member's display name as snapshot in the org membership record at
// join time — it can lag a later rename, consistent with the rest of the codebase.
export async function buildOrgLeaderboard(org: { org_id: string; org_name: string }): Promise<GetOrgLeaderboardResponse> {
  const members = await listOrgMembers(org.org_id);
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

  return { org_name: org.org_name, horses: entries };
}
