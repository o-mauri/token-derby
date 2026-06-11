export function formatTokens(n: number | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}

export function avgFinish(
  totalFinishingPosition: number | undefined,
  racesEntered: number | undefined,
): string {
  if (!racesEntered || !totalFinishingPosition) return '—';
  return (totalFinishingPosition / racesEntered).toFixed(1);
}
