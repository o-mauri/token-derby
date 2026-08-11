// Throwaway: the real /derbymarket board rendered against a live race, priced
// locally by api/scripts/preview-live-market.ts. Wired exactly like
// derbymarket/index.ts, minus the login and the API calls it cannot make until
// the feature is deployed.
import type { MarketPrice, MarketSnapshot } from '@token-derby/shared';
import { renderBoard, renderLoadError, type BoardData, type OpenRow } from './derbymarket/render/board.js';
import { renderPriceChart } from './derbymarket/render/chart.js';

type LiveData = Omit<BoardData, 'horses'> & {
  generated_at: string;
  joinCode: string;
  horses: Array<BoardData['horses'][number] & { prior_pace: number }>;
  prices: MarketPrice[];
  history: MarketSnapshot[];
};

const app = document.getElementById('app')!;
const stamp = document.getElementById('stamp')!;

let dispose: (() => void) | null = null;

async function load(): Promise<void> {
  let data: LiveData;
  try {
    const res = await fetch(`/live-market.json?t=${Date.now()}`);
    data = await res.json();
  } catch {
    dispose?.();
    renderLoadError(app);
    return;
  }

  stamp.textContent =
    `${data.joinCode} · priced ${new Date(data.generated_at).toLocaleTimeString()} · ` +
    `${data.history.length} snapshots`;

  const board: BoardData = {
    raceName: data.raceName,
    runnerCount: data.runnerCount,
    timeLeftSeconds: data.timeLeftSeconds,
    finished: data.finished,
    divisionNames: data.divisionNames,
    horses: data.horses,
    prices: data.prices,
  };

  const openChart = (row: OpenRow): void => {
    dispose?.();
    dispose = renderPriceChart(app, {
      history: data.history, runners: row.runners, market: row.market, name: row.name,
      meta: row.meta, sectionHeading: row.heading, divisionNames: data.divisionNames,
      onBack: show,
    });
  };

  function show(): void {
    dispose?.();
    dispose = renderBoard(app, board, openChart);
  }
  show();

  // ?row=N opens the Nth market's chart on load, so a screenshot doesn't need
  // a click first. 0 = To Win overall.
  const raw = new URLSearchParams(location.search).get('row');
  if (raw !== null && Number.isInteger(Number(raw))) {
    app.querySelectorAll<HTMLButtonElement>('.dm-row')[Number(raw)]?.click();
  }
}

void load();
