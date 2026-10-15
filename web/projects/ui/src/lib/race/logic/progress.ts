// Fraction of the race elapsed at `now`, clamped to 0..1.
export function elapsedPct(startTime: string, endTime: string, now: Date): number {
  const s = new Date(startTime).getTime();
  const e = new Date(endTime).getTime();
  if (e <= s) return 0;
  return Math.max(0, Math.min(1, (now.getTime() - s) / (e - s)));
}

/** The leading score, never below 1 so lane maths can always divide by it. */
export function leaderTokens(scores: readonly number[]): number {
  return Math.max(1, ...scores, 0);
}

/** How far along the lane a horse is, 0-100: its share of the leader, scaled by time elapsed. */
export function laneProgress(score: number, leader: number, elapsed: number): number {
  return (score / leader) * elapsed * 100;
}
