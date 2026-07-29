import type { GetRaceResponse, GetRaceSeriesResponse, HorseView } from '@token-derby/shared';
import { fetchRaceSeries } from '../api.js';
import { buildChartFaces, LINE_PALETTE, type Mode } from './race-chart.js';

const TAB_LABELS: ReadonlyArray<{ mode: Mode; label: string }> = [
  { mode: 'cumulative', label: 'Cumulative' },
  { mode: 'throughput', label: 'Tokens / min' },
];

export type RaceGraphs = {
  button: HTMLButtonElement;
  onSnapshot(race: GetRaceResponse): void;
  destroy(): void;
};

type Opts = {
  doc: Document;
  joinCode: string;
  fetchSeries?: (joinCode: string) => Promise<GetRaceSeriesResponse>;
  now?: () => number;
};

// Stable colour per horse: sorted horse ids indexed into the palette, so the
// mapping does not change as positions change, and every viewer sees the same
// colours. Rebuilt per render from the current field; ids only ever get added.
function colourMap(horses: readonly HorseView[]): Map<string, string> {
  const ids = [...horses].map((h) => h.horse_id).sort();
  return new Map(ids.map((id, i) => [id, LINE_PALETTE[i % LINE_PALETTE.length]!]));
}

// Live races must not chart past `now`, or the lines run flat to the scheduled
// end. The max guards clock skew putting the newest point beyond now.
function windowEnd(series: GetRaceSeriesResponse, nowMs: number): number {
  const latest = Math.max(
    series.start_ms,
    ...series.horses.flatMap((h) => h.points.map((p) => p.t)),
  );
  return Math.min(series.end_ms, Math.max(nowMs, latest));
}

export function createRaceGraphs(opts: Opts): RaceGraphs {
  const doc = opts.doc;
  const fetchSeries = opts.fetchSeries ?? ((jc: string) => fetchRaceSeries(jc));
  const now = opts.now ?? (() => Date.now());

  let open = false;
  let mode: Mode = 'cumulative';
  let division: number | null = null;   // null = All
  let snapshot: GetRaceResponse | null = null;
  let cached: GetRaceSeriesResponse | null = null;
  let abort: AbortController | null = null;
  let dialog: HTMLElement | null = null;
  let failed = false;

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'btn graphs-btn';
  button.setAttribute('aria-label', 'Show race graphs');
  button.textContent = '📈';

  const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

  function renderTabs(): void {
    if (!dialog) return;
    const host = dialog.querySelector<HTMLElement>('.race-graphs-tabs')!;
    host.innerHTML = '';
    for (const { mode: m, label } of TAB_LABELS) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'race-graphs-tab';
      b.dataset.mode = m;
      b.textContent = label;
      b.setAttribute('aria-selected', String(m === mode));
      b.addEventListener('click', () => {
        if (mode === m) return;
        mode = m;
        renderTabs();
        render();
      });
      host.appendChild(b);
    }
  }

  function visibleHorses(): readonly HorseView[] {
    const all = snapshot?.horses ?? [];
    return division === null ? all : all.filter((h) => h.division === division);
  }

  function renderDivisions(): void {
    if (!dialog) return;
    const host = dialog.querySelector<HTMLElement>('.race-graphs-divisions')!;
    host.innerHTML = '';
    const names = snapshot?.league_division_names;
    if (division !== null && (!names || division > names.length)) division = null;
    if (!names || names.length === 0) return;   // non-league race: no row at all
    const entries: Array<{ value: number | null; label: string }> = [
      { value: null, label: 'All' },
      ...names.map((label, i) => ({ value: i + 1, label })),
    ];
    for (const { value, label } of entries) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'race-graphs-div';
      b.dataset.division = value === null ? 'all' : String(value);
      b.textContent = label;
      b.setAttribute('aria-selected', String(value === division));
      b.addEventListener('click', () => {
        if (division === value) return;
        division = value;
        renderDivisions();
        render();          // from cache — deliberately no load()
      });
      host.appendChild(b);
    }
  }

  function showMessage(text: string): void {
    if (!dialog) return;
    const body = dialog.querySelector<HTMLElement>('.race-graphs-body')!;
    body.innerHTML = '';
    const p = doc.createElement('p');
    p.className = 'race-graphs-empty';
    p.textContent = text;
    body.appendChild(p);
  }

  function render(): void {
    if (!dialog || !snapshot) return;
    if (failed) { showMessage("Couldn't load the graphs — retrying shortly."); return; }
    if (!cached) return;
    const horses = visibleHorses();
    if (horses.length === 0) { showMessage('No data for this division yet.'); return; }
    const colours = colourMap(snapshot.horses);   // colours stay stable across filters
    const faces = buildChartFaces(doc, cached, horses, {
      modes: [mode],
      endMs: windowEnd(cached, now()),
      colourOf: (h) => colours.get(h.horse_id) ?? LINE_PALETTE[0]!,
    });
    if (faces.length === 0) {
      showMessage(division === null
        ? 'No token data yet — check back in a minute.'
        : 'No data for this division yet.');
      return;
    }
    const body = dialog.querySelector<HTMLElement>('.race-graphs-body')!;
    body.innerHTML = '';
    for (const f of faces) body.appendChild(f);
  }

  async function load(): Promise<void> {
    abort?.abort();
    const ctrl = new AbortController();
    abort = ctrl;
    try {
      const res = await fetchSeries(opts.joinCode);
      if (ctrl.signal.aborted) return;
      failed = false;
      cached = res;
      render();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      failed = true;
      render();
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'production') {
        console.warn('[race-graphs] series load failed', err);
      }
    }
  }

  function openDialog(): void {
    if (open) return;
    open = true;
    dialog = doc.createElement('div');
    dialog.className = 'race-graphs';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Race graphs');
    dialog.innerHTML = `
      <div class="race-graphs-backdrop"></div>
      <div class="race-graphs-panel">
        <div class="race-graphs-top">
          <div class="race-graphs-tabs"></div>
          <button type="button" class="race-graphs-close" aria-label="Close graphs">✕</button>
        </div>
        <div class="race-graphs-body"></div>
        <div class="race-graphs-divisions"></div>
      </div>
    `;
    dialog.querySelector<HTMLElement>('.race-graphs-backdrop')!
      .addEventListener('click', () => close());
    dialog.querySelector<HTMLButtonElement>('.race-graphs-close')!
      .addEventListener('click', () => close());
    doc.addEventListener('keydown', onKeydown);
    (button.parentElement?.closest('.race') ?? doc.body).appendChild(dialog);
    renderTabs();
    renderDivisions();
    void load();
  }

  function close(): void {
    if (!open) return;
    open = false;
    abort?.abort();
    abort = null;
    doc.removeEventListener('keydown', onKeydown);
    dialog?.remove();
    dialog = null;
  }

  button.addEventListener('click', () => (open ? close() : openDialog()));

  return {
    button,
    onSnapshot(race) {
      snapshot = race;
      if (open) renderDivisions();
      if (open) void load();
    },
    destroy() { close(); button.remove(); },
  };
}
