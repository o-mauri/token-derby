// Standalone preview of the /derbymarket board, rendered against a static
// fixture — no network calls. Loaded by /preview-derbymarket.html, not part
// of the main app bundle. Mirrors preview-org-manager.ts's approach.
import type { HorseColors, MarketPrice, MarketSnapshot } from '@token-derby/shared';
import { renderLogin } from './derbymarket/render/login.js';
import {
  renderBoard, renderNoLiveRace, renderMarketNotOpen, renderNoMarketData, renderLoadError,
  type BoardHorse, type OpenRow,
} from './derbymarket/render/board.js';
import { renderPriceChart } from './derbymarket/render/chart.js';

const app = document.getElementById('app')!;

const color = (body: string): HorseColors => ({ body, mane: '#1a1a1a', tail: '#1a1a1a', saddle: '#333333' });

// 8 horses across 3 divisions, sized to exercise every suppression rule at
// once: Premier (4) gets both Win and Podium markets, Contenders (3) gets
// Win only (<4 runners), Rookies (1) gets neither (<2 runners).
const horses: BoardHorse[] = [
  { horse_id: 'h1', name: 's2d2', colors: color('#C8102E'), division: 1, jockey: 'Guiom', banked: 34_300_000, rank: 1 },
  { horse_id: 'h2', name: 'death_to_tokens', colors: color('#0F6E6E'), division: 1, jockey: 'Will', banked: 11_300_000, rank: 4 },
  { horse_id: 'h3', name: 'Clop Clip Seven', colors: color('#B8860B'), division: 1, jockey: 'Omar', banked: 11_400_000, rank: 3 },
  { horse_id: 'h4', name: 'oh, claude!', colors: color('#6A4C93'), division: 1, jockey: 'Stu', banked: 12_400_000, rank: 2 },
  { horse_id: 'h5', name: 'Shadow Knight', colors: color('#1F7A8C'), division: 2, jockey: 'Shourya', banked: 9_000_000, rank: 5 },
  { horse_id: 'h6', name: 'Sunny J', colors: color('#C05621'), division: 2, jockey: 'Joe', banked: 8_600_000, rank: 6 },
  { horse_id: 'h7', name: 'Glue Factory', colors: color('#5F8D4E'), division: 2, jockey: 'Gordon', banked: 7_500_000, rank: 7 },
  { horse_id: 'h8', name: 'Sanic', colors: color('#8E7CC3'), division: 3, jockey: 'JM', banked: 3_100_000, rank: 8 },
];

// Synthetic 30-snapshot history for the Premier "To Win" market. `oh, claude!`
// (h4) has no price for the first 10 snapshots, showing a late joiner.
function buildWinHistory(): MarketSnapshot[] {
  const START_BUCKET = 20_000;
  const STEP_MIN = 5;
  const COUNT = 30;
  const base: Record<string, number> = { h1: 0.42, h2: 0.20, h3: 0.11, h4: 0.05 };
  const driftPerStep: Record<string, number> = { h1: -0.006, h2: 0.004, h3: 0.001, h4: 0.014 };

  const history: MarketSnapshot[] = [];
  for (let i = 0; i < COUNT; i++) {
    const bucket = START_BUCKET + i * STEP_MIN;
    const raw: Record<string, number> = {};
    for (const id of ['h1', 'h2', 'h3', 'h4']) {
      if (id === 'h4' && i < 10) continue;
      const wobble = Math.sin(i * 0.6 + id.charCodeAt(1) * 0.3) * 0.015;
      raw[id] = Math.max(0.01, base[id]! + driftPerStep[id]! * i + wobble);
    }
    const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
    const snapshotPrices: MarketPrice[] = Object.entries(raw).map(([horse_id, v]) => ({
      horse_id, win: v / total, podium: 0.5, division: null, divisionPodium: null,
    }));
    history.push({
      race_id: 'preview', bucket, computed_at: new Date(bucket * 60_000).toISOString(),
      phantoms: 0, prices: snapshotPrices,
    });
  }
  return history;
}
const winHistory = buildWinHistory();

// divisionPodium (top 3 within a runner's own division) is always >= its
// race-wide podium — top-3-of-4 is a much easier bar than top-3-of-8. A
// division of 3 or fewer trivially prices everyone at 1.00.
const prices: MarketPrice[] = [
  { horse_id: 'h1', win: 0.40, podium: 0.85, division: 0.55, divisionPodium: 0.98 },
  { horse_id: 'h2', win: 0.20, podium: 0.65, division: 0.25, divisionPodium: 0.92 },
  { horse_id: 'h3', win: 0.10, podium: 0.45, division: 0.12, divisionPodium: 0.78 },
  { horse_id: 'h4', win: 0.05, podium: 0.25, division: 0.08, divisionPodium: 0.55 },
  { horse_id: 'h5', win: 0.12, podium: 0.40, division: 0.55, divisionPodium: 1.00 },
  { horse_id: 'h6', win: 0.08, podium: 0.25, division: 0.35, divisionPodium: 1.00 },
  { horse_id: 'h7', win: 0.03, podium: 0.10, division: 0.10, divisionPodium: 1.00 },
  { horse_id: 'h8', win: 0.02, podium: 0.05, division: 1.00, divisionPodium: 1.00 },
];

const divisionNames = ['Premier', 'Contenders', 'Rookies'];

function section(title: string): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'org-preview-section';
  wrap.innerHTML = `<h2 class="org-preview-heading">${title}</h2><div class="dm-preview-body"></div>`;
  app.appendChild(wrap);
  return wrap.querySelector<HTMLElement>('.dm-preview-body')!;
}

// Section 1: signed-out state.
renderLogin(section('Signed out'));

// Section 2: empty states.
renderNoLiveRace(section('Empty — no live race'));
renderMarketNotOpen(section('Empty — market not open yet'), { raceName: 'Acme League Round 5', opensInSeconds: 743 });
renderNoMarketData(section('Empty — race finished before the market opened'), { raceName: 'Acme League Round 3' });
renderLoadError(section('Empty — load error'));

// Section 3: the live board, all eight markets — clicking a row opens its
// price chart in place, exactly as index.ts wires it against the real API.
const liveBoardRoot = section('Live board — click a row to open its price chart');
const liveBoardData = {
  raceName: 'Acme League Round 5',
  runnerCount: horses.length,
  timeLeftSeconds: 7_380,
  finished: false,
  divisionNames,
  horses,
  prices,
};
function showLiveBoard(): void {
  renderBoard(liveBoardRoot, liveBoardData, (row: OpenRow) => {
    renderPriceChart(liveBoardRoot, {
      history: winHistory, runners: row.runners, market: row.market, name: row.name,
      meta: row.meta, sectionHeading: row.heading, divisionNames, onBack: showLiveBoard,
    });
  });
}
showLiveBoard();

// Section 4: finished — same board, final prices, no clock.
renderBoard(section('Finished board — final prices'), {
  raceName: 'Acme League Round 4',
  runnerCount: horses.length,
  timeLeftSeconds: null,
  finished: true,
  divisionNames,
  horses,
  prices,
});

// Section 5: the price chart on its own, always open — so it shows up in a
// plain screenshot without needing to simulate a click first.
const premierByWin = [...horses.slice(0, 4)].sort((a, b) => {
  const pa = prices.find((p) => p.horse_id === a.horse_id)!.win;
  const pb = prices.find((p) => p.horse_id === b.horse_id)!.win;
  return pb - pa;
});
renderPriceChart(section('Price chart — To Win, Premier, one runner joined late'), {
  history: winHistory,
  runners: premierByWin.map((horse) => ({ horse, price: prices.find((p) => p.horse_id === horse.horse_id)!.win })),
  market: 'win',
  name: 'To Win',
  meta: '4 runners',
  sectionHeading: 'Premier · 4 runners',
  divisionNames,
  onBack: () => {},
});
