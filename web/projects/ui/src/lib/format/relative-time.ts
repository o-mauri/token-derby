// Fixed names: Node's en-GB ICU says "Sept", the browsers say "Sep".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "5 min ago", "yesterday", "2 weeks ago"; a plain date once it's more than nine weeks back. */
export function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  const ago = Math.max(0, now - then);
  if (ago < MIN) return 'just now';
  if (ago < HOUR) return `${Math.floor(ago / MIN)} min ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)} h ago`;
  if (ago < 2 * DAY) return 'yesterday';
  if (ago < 14 * DAY) return `${Math.floor(ago / DAY)} days ago`;
  if (ago < 63 * DAY) return `${Math.floor(ago / (7 * DAY))} weeks ago`;
  const d = new Date(then);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
