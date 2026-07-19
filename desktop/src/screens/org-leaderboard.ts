import type { GetOrgLeaderboardResponse, OrganisationSummary } from '@token-derby/shared';

export type LeaderboardRow = {
  name: string;
  owner_name: string;
  wins: number;
  podiums: number;
  xp: number;
};

// The leaderboard endpoint is keyed by org NAME, not org_id (see
// api/src/handlers/get-org-leaderboard.ts — it resolves the path param via
// getOrganisationByName and rejects anything not matching ORG_NAME_PATTERN,
// which a randomUUID org_id never does). This is the one place that decides
// which of an OrganisationSummary's two ids to send, kept pure and separate
// from Org.tsx so it's directly testable against a summary with distinct
// org_id/org_name values.
export function resolveOrgName(orgs: readonly OrganisationSummary[], orgId: string | null): string | null {
  if (!orgId) return null;
  return orgs.find((org) => org.org_id === orgId)?.org_name ?? null;
}

// Pure mapping from the org leaderboard response to the rows the Org tab
// renders. The server already sorts by xp descending, but sorting again here
// keeps the tab correct even if that ever changes.
export function mapLeaderboard(resp: GetOrgLeaderboardResponse): LeaderboardRow[] {
  return [...resp.horses]
    .sort((a, b) => b.xp - a.xp)
    .map((horse) => ({
      name: horse.name,
      owner_name: horse.owner_name,
      wins: horse.wins,
      podiums: horse.podiums,
      xp: horse.xp,
    }));
}
