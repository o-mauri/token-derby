import type { RaceSummary, RaceHighlight } from '@token-derby/shared';
import { hatById } from '@token-derby/shared';
import { fetchOrgRaces, ApiError } from '../api.js';
import { horseFaceSvg } from '../horse-face.js';
import { buildHorseSvg } from '../sprite-svg.js';
import { buildHatGroup } from '../hat-svg.js';
import {
  formatDuration,
  predictTimeLeftSeconds,
  countdownSeconds,
  type CountdownAnchor,
} from '../time.js';

const TIMER_TICK_MS = 1000;

export function renderOrg(root: HTMLElement, orgName: string): () => void {
  root.innerHTML = '';
  const doc = root.ownerDocument;
  const section = doc.createElement('section');
  section.className = 'org';
  section.innerHTML = `
    <header class="org-header">
      <h1>${horseFaceSvg()} <span class="org-name">${escapeHtml(orgName)}</span></h1>
      <div class="meta"><button type="button" class="btn home-btn">← Home</button></div>
    </header>
    <div class="org-body"><p class="org-status">Loading…</p></div>
  `;
  root.appendChild(section);

  const body = section.querySelector<HTMLElement>('.org-body')!;
  const homeBtn = section.querySelector<HTMLButtonElement>('.home-btn')!;
  homeBtn.addEventListener('click', () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  const ctrl = new AbortController();

  // Per-render countdown machinery. `tickers` is populated once the race data
  // arrives; the single interval below updates every live/pending countdown
  // cell each second. No API polling — the data snapshot is captured once.
  let tickers: Ticker[] = [];
  const tick = () => {
    const nowMs = Date.now();
    const now = new Date(nowMs);
    for (const t of tickers) t(nowMs, now);
  };
  const interval = setInterval(tick, TIMER_TICK_MS);

  fetchOrgRaces(orgName).then((res) => {
    if (ctrl.signal.aborted) return;
    const nameEl = section.querySelector<HTMLElement>('.org-name')!;
    nameEl.textContent = res.org_name;
    tickers = renderRaceList(body, res.races);
    tick(); // paint countdowns immediately rather than waiting a full second
  }).catch((err: unknown) => {
    if (ctrl.signal.aborted) return;
    if (err instanceof ApiError && err.code === 'ORG_NOT_FOUND') {
      body.innerHTML = `<p class="org-status">No organisation named <b>${escapeHtml(orgName)}</b>.</p>`;
      return;
    }
    body.innerHTML = `<p class="org-status">Couldn't load races. Try again later.</p>`;
  });

  return () => {
    ctrl.abort();
    clearInterval(interval);
  };
}

// A ticker mutates one countdown cell given the current time.
type Ticker = (nowMs: number, now: Date) => void;

function renderRaceList(body: HTMLElement, races: RaceSummary[]): Ticker[] {
  const live = races.filter(r => r.status === 'live');
  const pending = races.filter(r => r.status === 'pending');
  const finished = races.filter(r => r.status === 'finished');

  if (races.length === 0) {
    body.innerHTML = `<p class="org-status">No races yet. Create one with <code>token-derby create</code>.</p>`;
    return [];
  }

  body.innerHTML = '';
  const doc = body.ownerDocument;
  const tickers: Ticker[] = [];
  for (const [title, group] of [
    ['Live', live],
    ['Upcoming', pending],
    ['Finished', finished],
  ] as const) {
    const sectionEl = renderSection(doc, title, group, tickers);
    if (sectionEl) body.appendChild(sectionEl);
  }
  return tickers;
}

function renderSection(
  doc: Document,
  title: string,
  races: RaceSummary[],
  tickers: Ticker[],
): HTMLElement | null {
  if (races.length === 0) return null;
  const section = doc.createElement('section');
  section.className = 'org-section';

  const h2 = doc.createElement('h2');
  h2.textContent = title;
  section.appendChild(h2);

  const ul = doc.createElement('ul');
  ul.className = 'race-list';
  for (const r of races) ul.appendChild(renderRaceRow(doc, r, tickers));
  section.appendChild(ul);
  return section;
}

function renderRaceRow(doc: Document, r: RaceSummary, tickers: Ticker[]): HTMLElement {
  const li = doc.createElement('li');
  li.className = 'race-row';

  const a = doc.createElement('a');
  a.href = `/race/${encodeURIComponent(r.join_code)}`;

  // 1. Name + join code (+ date for finished/pending races).
  const ident = doc.createElement('div');
  ident.className = 'race-row-ident';
  const nameEl = doc.createElement('span');
  nameEl.className = 'race-row-name';
  nameEl.textContent = r.name;
  const meta = doc.createElement('span');
  meta.className = 'race-row-meta';
  const codeEl = doc.createElement('span');
  codeEl.className = 'race-row-code';
  codeEl.textContent = r.join_code;
  meta.appendChild(codeEl);
  const dateText = r.status === 'finished' ? formatEndDate(r)
    : r.status === 'pending' ? formatStart(r)
    : '';
  if (dateText) {
    const dateEl = doc.createElement('span');
    dateEl.className = 'race-row-date';
    dateEl.textContent = dateText;
    meta.appendChild(dateEl);
  }
  ident.appendChild(nameEl);
  ident.appendChild(meta);
  a.appendChild(ident);

  // 2. Status-specific info, right-aligned. The winner/leader line carries the
  //    mini sprite next to the horse name.
  a.appendChild(buildStatusInfo(doc, r, tickers));

  li.appendChild(a);
  return li;
}

function buildMiniSprite(doc: Document, highlight: RaceHighlight): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 'race-row-sprite';
  wrap.style.setProperty('--body', highlight.colors.body);
  wrap.style.setProperty('--mane', highlight.colors.mane);
  wrap.style.setProperty('--tail', highlight.colors.tail);
  wrap.style.setProperty('--saddle', highlight.colors.saddle);

  const svg = buildHorseSvg(doc);
  if (highlight.hat) {
    const hat = hatById(highlight.hat.id);
    if (hat) svg.appendChild(buildHatGroup(doc, hat, highlight.hat.variant ?? 0));
  }
  wrap.appendChild(svg);
  return wrap;
}

// A winner/leader line: mini sprite followed by "name · N tokens" text.
function buildHighlightLine(
  doc: Document,
  highlight: RaceHighlight,
  className: string,
  label: string,
): HTMLElement {
  const line = doc.createElement('span');
  line.className = className;
  line.appendChild(buildMiniSprite(doc, highlight));
  const text = doc.createElement('span');
  text.textContent = label;
  line.appendChild(text);
  return line;
}

function buildStatusInfo(doc: Document, r: RaceSummary, tickers: Ticker[]): HTMLElement {
  const info = doc.createElement('div');
  info.className = 'race-row-info';

  if (r.status === 'finished') {
    if (r.highlight) {
      info.appendChild(buildHighlightLine(
        doc, r.highlight, 'race-row-winner',
        `🏆 ${r.highlight.horse_name} · ${r.highlight.tokens.toLocaleString()} tokens`,
      ));
    }
    return info;
  }

  if (r.status === 'live') {
    const countdown = doc.createElement('span');
    countdown.className = 'race-row-countdown';
    const anchor: CountdownAnchor = {
      atMs: Date.now(),
      timeLeftSeconds: r.time_left_seconds ?? 0,
    };
    tickers.push((nowMs) => {
      const left = predictTimeLeftSeconds(anchor, nowMs);
      countdown.textContent = left <= 0 ? 'Finished' : formatDuration(left);
    });
    info.appendChild(countdown);

    if (r.highlight) {
      info.appendChild(buildHighlightLine(
        doc, r.highlight, 'race-row-leader',
        `${r.highlight.horse_name} · ${r.highlight.tokens.toLocaleString()} tokens`,
      ));
    }
    return info;
  }

  // pending
  const countdown = doc.createElement('span');
  countdown.className = 'race-row-countdown';
  tickers.push((_nowMs, now) => {
    const left = countdownSeconds(r.start_time, now);
    countdown.textContent = left <= 0 ? 'Starting…' : `Starts in ${formatDuration(left)}`;
  });
  info.appendChild(countdown);
  return info;
}

function formatEndDate(r: RaceSummary): string {
  const d = new Date(r.ended_at ?? r.end_time);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric' });
}

function formatStart(r: RaceSummary): string {
  const d = new Date(r.start_time);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}
