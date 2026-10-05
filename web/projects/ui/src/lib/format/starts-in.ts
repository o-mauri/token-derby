/** How soon something starts, to the two largest whole units: "in 1d 14h", "in 3h 25m", "in 25m". */
export function startsIn(seconds: number): string {
  if (seconds <= 0) return 'starting';
  if (seconds < 60) return 'in under a minute';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = d > 0 ? [[d, 'd'], [h, 'h']] : h > 0 ? [[h, 'h'], [m, 'm']] : [[m, 'm']];
  return 'in ' + parts.filter(([n], i) => i === 0 || n !== 0).map(([n, u]) => `${n}${u}`).join(' ');
}
