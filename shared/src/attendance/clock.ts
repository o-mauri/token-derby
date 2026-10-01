// Local clock time and the fixed 24-hour habit grid.

export const DAY_MINUTES = 1440;
export const BIN_MINUTES = 6;
export const GRID = DAY_MINUTES / BIN_MINUTES;
export const TRI_CELLS = (GRID * (GRID + 1)) / 2;

const timeFormats = new Map<string, Intl.DateTimeFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function timeFormat(tz: string): Intl.DateTimeFormat {
  let f = timeFormats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    timeFormats.set(tz, f);
  }
  return f;
}

function dateFormat(tz: string): Intl.DateTimeFormat {
  let f = dateFormats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    dateFormats.set(tz, f);
  }
  return f;
}

/** Minutes since local midnight in `tz`, seconds kept as a fraction. */
export function clockMinutes(iso: string, tz: string): number {
  const parts = timeFormat(tz).formatToParts(new Date(iso));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return part('hour') * 60 + part('minute') + part('second') / 60;
}

export function localDate(iso: string, tz: string): string {
  return dateFormat(tz).format(new Date(iso));
}

export function binOf(minute: number): number {
  return Math.min(GRID - 1, Math.max(0, Math.floor(minute / BIN_MINUTES)));
}

export function binCentre(bin: number): number {
  return (bin + 0.5) * BIN_MINUTES;
}

export function cellIndex(x: number, y: number): number {
  return x * GRID + y;
}

export function formatClock(minute: number): string {
  const m = Math.round(minute);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
