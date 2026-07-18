import type { GetOrgLeaderboardResponse } from '@token-derby/shared';

export type LeaderboardRow = {
  name: string;
  owner_name: string;
  wins: number;
  podiums: number;
  xp: number;
};

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
