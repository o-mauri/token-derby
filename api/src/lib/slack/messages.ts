import type {
  RaceCreatedEvent, RaceEndedEvent, RaceEndedResult,
  LeaderboardEntry, GetOrgLeaderboardResponse,
  AnnounceReleaseRequest,
} from '@token-derby/shared';
import type { LeagueSeasonEndedEvent, LeagueMoveRow } from '@token-derby/shared';

export type SlackMessage = { text: string; blocks: any[] };

const MEDALS = ['🥇', '🥈', '🥉'] as const;

function formatRaceTime(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(d);
}

export function buildRaceCreatedMessage(event: RaceCreatedEvent): SlackMessage {
  const { race, organisation } = event;
  const sectionText =
    `<!here>\n\n` +
    `*"${race.name}"*  ·  _${organisation.org_name}_\n\n` +
    `⏰  *Starts:* ${formatRaceTime(race.start_time, race.tz)}\n` +
    `🏁  *Ends:*    ${formatRaceTime(race.end_time,   race.tz)}\n\n` +
    `May the fastest horse win! 🐎`;

  return {
    text: `New race starting in Token Derby: ${race.name} — join code ${race.join_code}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏇  A new Race is starting in Token Derby!', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: sectionText } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: 'Join code:' } },
      { type: 'header', text: { type: 'plain_text', text: `🔑  ${race.join_code}`, emoji: true } },
    ],
  };
}

function rankPrefix(rank: number): string {
  if (rank >= 1 && rank <= 3) return MEDALS[rank - 1]!;
  return '  ';
}

function leaderboardLine(r: RaceEndedResult): string {
  const tokens = r.final_scored_tokens ?? r.final_tokens;
  return `${rankPrefix(r.rank)}  ${r.rank}.  *${r.name}*  ${tokens} tokens  ·  ${r.user_name}`;
}

export function buildRaceEndedMessage(event: RaceEndedEvent, spriteUrl?: string): SlackMessage {
  const { race, organisation, results } = event;
  const header = `<!here>\n\n*"${race.name}"*  ·  _${organisation.org_name}_`;
  const winner = results[0];

  let body: string;
  if (results.length === 0) {
    body = 'No horses finished this one.';
  } else {
    const board = results.map(leaderboardLine).join('\n');
    body = `${board}\n\n🎉  Congrats to *${winner!.name}*!`;
  }

  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: '🏁  The Race has finished!', emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `${header}\n\n${body}` } },
  ];

  if (winner && spriteUrl) {
    blocks.push({ type: 'image', image_url: spriteUrl, alt_text: `${winner.name} — winning horse` });
  }

  const text = winner ? `Race finished: ${race.name} — winner ${winner.name}` : `Race finished: ${race.name}`;
  return { text, blocks };
}

type Metric = 'wins' | 'podiums' | 'xp';

function rankBy(horses: LeaderboardEntry[], primary: Metric): LeaderboardEntry[] {
  const order: Record<Metric, Metric[]> = {
    wins: ['wins', 'podiums', 'xp'], podiums: ['podiums', 'wins', 'xp'], xp: ['xp', 'wins', 'podiums'],
  };
  const keys = order[primary];
  return [...horses].sort((a, b) => {
    for (const k of keys) { if (b[k] !== a[k]) return b[k] - a[k]; }
    return a.name.localeCompare(b.name);
  });
}

function categorySection(title: string, horses: LeaderboardEntry[], metric: Metric, unit: string): any {
  const top = rankBy(horses, metric).slice(0, 5);
  const lines = top.map((h, i) => {
    const rank = i + 1;
    const label = rank <= 3 ? MEDALS[rank - 1]! : `${rank}.`;
    const value = h[metric];
    const u = value === 1 ? unit.replace(/s$/, '') : unit;
    return `${label}  *${h.name}*  ${value} ${u}  ·  ${h.owner_name}`;
  });
  return { type: 'section', text: { type: 'mrkdwn', text: `*${title}*\n\n${lines.join('\n')}` } };
}

export function buildWeeklyDigestMessage(data: GetOrgLeaderboardResponse): SlackMessage {
  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: '🏇  Weekly Stable Leaderboard', emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `<!here>\n\n_${data.org_name}_  ·  all-time top horses` } },
    { type: 'divider' },
    categorySection('Most Wins', data.horses, 'wins', 'wins'),
    { type: 'divider' },
    categorySection('Most Podiums', data.horses, 'podiums', 'podiums'),
    { type: 'divider' },
    categorySection('Most XP', data.horses, 'xp', 'XP'),
  ];
  return { text: `Weekly leaderboard for ${data.org_name}`, blocks };
}

function moveLines(rows: LeagueMoveRow[], arrow: string): string {
  if (rows.length === 0) return '_none_';
  return rows
    .map((r) => `${arrow}  *${r.horse_name}*  D${r.from_division} → D${r.to_division}  ·  ${r.user_name}`)
    .join('\n');
}

export function buildLeagueSeasonEndedMessage(event: LeagueSeasonEndedEvent): SlackMessage {
  const { league, organisation } = event;
  const championText = league.champion
    ? `👑  *${league.champion.horse_name}*  ${league.champion.points} pts  ·  ${league.champion.user_name}`
    : '_No champion this season._';

  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: `🏆  League Season ${league.season} complete!`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `<!here>\n\n_${organisation.org_name}_  ·  Season ${league.season} champion:\n\n${championText}` } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*⬆️ Promoted*\n\n${moveLines(league.promoted, '⬆️')}` } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*⬇️ Relegated*\n\n${moveLines(league.relegated, '⬇️')}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Season ${league.next_season} starts now — good luck! 🐎` }] },
  ];

  const text = league.champion
    ? `League Season ${league.season} complete — champion ${league.champion.horse_name}`
    : `League Season ${league.season} complete`;
  return { text, blocks };
}

const CLI_PACKAGE = '@mauricode/token-derby';
const SITE_URL = 'token-derby.mauricode.co.uk';

function formatReleaseDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

// Deliberately no <!here> — release notes are reference material, and this
// message also fires on the far more frequent site deploys.
export function buildReleaseMessage(release: AnnounceReleaseRequest): SlackMessage {
  const isCli = release.component === 'cli';
  const label = isCli ? 'CLI' : 'Site';
  const bullets = release.changes.map((c) => `•  ${c}`).join('\n');

  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: `🚀  ${label} updated — v${release.version}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `_Token Derby ${label}_  ·  ${formatReleaseDate(release.date)}\n\n${bullets}` } },
  ];
  if (isCli) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `\`npm i -g ${CLI_PACKAGE}@latest\`` } });
  }
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Full changelog → ${SITE_URL}/about` }] });

  return { text: `Token Derby ${label} v${release.version} released`, blocks };
}
