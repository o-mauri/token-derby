// Standalone preview of every market view against fixtures, no network calls.
// Loaded by /preview-market.html, not part of the main app bundle.
import type { HorseColors, MarketPrice, RaceSummary } from '@token-derby/shared';
import { createLoader } from './render/loader.js';
import { renderBoard, type BoardHorse } from './derbymarket/render/board.js';
import {
  renderPickerSignedIn, renderPickerSignedOut, renderMarketNotFound, type PickerEntry,
} from './derbymarket/render/picker.js';
import { initTheme } from './theme.js';

document.body.classList.add('tv');
initTheme();

const app = document.getElementById('app')!;
const color = (body: string): HorseColors => ({ body, mane: '#1a1a1a', tail: '#1a1a1a', saddle: '#333333' });

const horses: BoardHorse[] = [
  { horse_id: 'h1', name: 's2d2', colors: color('#C8102E'), division: 1, jockey: 'Guiom', banked: 34_300_000, rank: 1 },
  { horse_id: 'h2', name: 'death_to_tokens', colors: color('#0F6E6E'), division: 1, jockey: 'Will', banked: 11_300_000, rank: 4 },
  { horse_id: 'h3', name: 'Clop Clip Seven', colors: color('#B8860B'), division: 1, jockey: 'Omar', banked: 11_400_000, rank: 3 },
  { horse_id: 'h4', name: 'oh, claude!', colors: color('#6A4C93'), division: 1, jockey: 'Stu', banked: 12_400_000, rank: 2 },
  { horse_id: 'h5', name: 'Shadow Knight', colors: color('#1F7A8C'), division: 2, jockey: 'Shourya', banked: 9_000_000, rank: 5 },
  { horse_id: 'h6', name: 'Sunny J', colors: color('#C05621'), division: 2, jockey: 'Joe', banked: 8_600_000, rank: 6 },
];

const prices: MarketPrice[] = [
  { horse_id: 'h1', joined: true, win: 0.40, podium: 0.85, division: 0.55, divisionPodium: 0.98 },
  { horse_id: 'h2', joined: true, win: 0.20, podium: 0.65, division: 0.25, divisionPodium: 0.92 },
  { horse_id: 'h3', joined: true, win: 0.10, podium: 0.45, division: 0.12, divisionPodium: 0.78 },
  { horse_id: 'h4', joined: true, win: 0.05, podium: 0.25, division: 0.08, divisionPodium: 0.55 },
  { horse_id: 'h5', joined: true, win: 0.15, podium: 0.55, division: 0.60, divisionPodium: 1.00 },
  { horse_id: 'h6', joined: true, win: 0.10, podium: 0.35, division: 0.40, divisionPodium: 1.00 },
];

const divisionNames = ['Premier', 'Contenders'];
const base = {
  runnerCount: horses.length, divisionNames, horses, prices, showNotJoined: false, orgName: 'StackOne',
};

function section(title: string): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'org-preview-section';
  wrap.innerHTML = `<h2 class="org-preview-heading">${title}</h2><div class="dm-preview-body"></div>`;
  app.appendChild(wrap);
  return wrap.querySelector<HTMLElement>('.dm-preview-body')!;
}

renderBoard(section('Board, live'), {
  ...base, raceName: 'League Race 9/10', timeLeftSeconds: 7_380, finished: false,
});

const nextStart = new Date(Date.now() + (13 * 60 + 42) * 60_000).toISOString();
renderBoard(section('Board, finished with next race'), {
  ...base, raceName: 'League Race 9/10', timeLeftSeconds: null, finished: true,
  nextRace: { name: 'League Race 10/10', startsAt: nextStart },
});

const summary = (name: string, start: string, status: RaceSummary['status']): RaceSummary => ({
  race_id: name, name, join_code: 'ABC123', start_time: start, end_time: start, status,
});
const entries: PickerEntry[] = [
  { org_name: 'StackOne', live: summary('League Race 9/10', new Date().toISOString(), 'live'), next: null },
  { org_name: 'Quietco', live: null, next: summary('Friday Sprint', nextStart, 'pending') },
];
renderPickerSignedIn(section('Picker, signed in'), entries, (p) => p);
renderPickerSignedOut(section('Picker, signed out'), () => {});
renderMarketNotFound(section('Not found'), 'acme', (p) => p);
const loaderBox = section('Loading');
loaderBox.appendChild(createLoader(document));
