const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

// ISO weekday (1=Mon .. 7=Sun) of instant `now` evaluated in IANA `tz`.
export function isoWeekdayInTz(now: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  const iso = WEEKDAY_TO_ISO[wd];
  if (!iso) throw new Error(`Unexpected weekday "${wd}" for tz "${tz}"`);
  return iso;
}

// "YYYY-MM-DD" calendar date of instant `now` in IANA `tz`.
export function localDateInTz(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Wall-clock local date "YYYY-MM-DD" + "HH:MM" in IANA `tz` -> UTC epoch ms.
// DST-correct via a two-pass offset correction.
export function localDateTimeToUtcMs(localDate: string, hhmm: string, tz: string): number {
  const [y, mo, d] = localDate.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const wallUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  let ts = wallUtc;
  for (let i = 0; i < 2; i++) {
    const want = wallUtc - tzOffsetMinutes(new Date(ts), tz) * 60_000;
    if (want === ts) break;
    ts = want;
  }
  return ts;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Offset (minutes, east-positive) of `tz` at instant `at`.
function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = Number(p.value);
  let hour = map.hour;
  if (hour === 24) hour = 0; // some ICU builds emit "24" for midnight
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}
