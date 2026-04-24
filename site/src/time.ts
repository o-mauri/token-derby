export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(ss)}`;
}

export function countdownSeconds(start_time: string, now: Date): number {
  const delta = Math.floor((new Date(start_time).getTime() - now.getTime()) / 1000);
  return Math.max(0, delta);
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
