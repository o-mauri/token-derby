import { describe, it, expect } from 'vitest';
import { renderPriceChart } from '../../src/derbymarket/render/chart.js';
import type { BoardHorse } from '../../src/derbymarket/render/board.js';
import type { MarketSnapshot } from '@token-derby/shared';

const colors = (body: string) => ({ body, mane: '#111', tail: '#111', saddle: '#222' });

function horse(id: string, name: string, opts: Partial<BoardHorse> = {}): BoardHorse {
  return { horse_id: id, name, colors: colors('#c00'), ...opts };
}

const history: MarketSnapshot[] = [
  { race_id: 'r', bucket: 100, computed_at: '', phantoms: 0, prices: [
    { horse_id: 'h1', win: 0.3, podium: 0.5, division: null, divisionPodium: null },
    { horse_id: 'h2', win: 0.7, podium: 0.5, division: null, divisionPodium: null },
  ] },
  { race_id: 'r', bucket: 105, computed_at: '', phantoms: 0, prices: [
    { horse_id: 'h1', win: 0.35, podium: 0.5, division: null, divisionPodium: null },
    { horse_id: 'h2', win: 0.65, podium: 0.5, division: null, divisionPodium: null },
  ] },
  { race_id: 'r', bucket: 110, computed_at: '', phantoms: 0, prices: [
    { horse_id: 'h1', win: 0.4, podium: 0.5, division: null, divisionPodium: null },
    { horse_id: 'h2', win: 0.6, podium: 0.5, division: null, divisionPodium: null },
  ] },
];

const runners = [
  { horse: horse('h2', 'Beta'), price: 0.6 },
  { horse: horse('h1', 'Alpha'), price: 0.4 },
];

function renderFixture(root: HTMLElement, onBack = () => {}) {
  return renderPriceChart(root, {
    history, runners, market: 'win', name: 'To Win', meta: '2 runners',
    sectionHeading: 'The race', onBack,
  });
}

describe('renderPriceChart structure', () => {
  it('draws one trace and one invisible hit-stroke per runner, hits layered above the lines', () => {
    const root = document.createElement('div');
    renderFixture(root);
    const traces = root.querySelectorAll('.dm-pc-trace');
    const hits = root.querySelectorAll('.dm-pc-hit');
    expect(traces.length).toBe(2);
    expect(hits.length).toBe(2);
    // Every hit carries the index that ties it back to its row/trace.
    expect(Array.from(hits).map((h) => h.getAttribute('data-i'))).toEqual(['0', '1']);

    // The hit-stroke only works if it's painted above the visible line — assert
    // the actual <g> order, not just presence: reversing the two appendChild
    // calls in the renderer would leave this suite green otherwise.
    const groups = root.querySelectorAll('svg.dm-pc-svg > g');
    expect(groups.length).toBe(2);
    expect(groups[0]!.querySelector('.dm-pc-trace')).not.toBeNull();
    expect(groups[0]!.querySelector('.dm-pc-hit')).toBeNull();
    expect(groups[1]!.querySelector('.dm-pc-hit')).not.toBeNull();
    expect(groups[1]!.querySelector('.dm-pc-trace')).toBeNull();
  });

  it('renders one row per runner in the given (YES-price) order', () => {
    const root = document.createElement('div');
    renderFixture(root);
    const rows = root.querySelectorAll('.dm-pc-row');
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).toContain('Beta');
    expect(rows[1]!.textContent).toContain('Alpha');
  });

  it('rows are focusable so they are reachable by keyboard, without claiming to be actionable', () => {
    const root = document.createElement('div');
    renderFixture(root);
    const rows = root.querySelectorAll<HTMLElement>('.dm-pc-row');
    expect(Array.from(rows).every((r) => r.tabIndex === 0)).toBe(true);
    // Not a button: hovering/focusing a row only highlights its line, it has
    // no action of its own — a button role would advertise one it lacks.
    expect(Array.from(rows).every((r) => r.tagName !== 'BUTTON')).toBe(true);
  });

  it('shows the live snapshot price the user clicked, not a stale history bucket', () => {
    const root = document.createElement('div');
    // Beta's (h2) latest HISTORY point is 0.6, but the board's live snapshot
    // (what the user actually clicked) has moved on to 0.75 — the row must
    // show the live number, not the older recorded one.
    const liveRunners = [
      { horse: horse('h2', 'Beta'), price: 0.75 },
      { horse: horse('h1', 'Alpha'), price: 0.4 },
    ];
    renderPriceChart(root, {
      history, runners: liveRunners, market: 'win', name: 'To Win', meta: '2 runners',
      sectionHeading: 'The race', onBack: () => {},
    });
    const rows = root.querySelectorAll<HTMLElement>('.dm-pc-row');
    const yesValue = rows[0]!.querySelector('.dm-pc-yes .vv')!.textContent;
    expect(yesValue).toBe((0.75 + 0.01).toFixed(2));
  });

  it('the back button calls onBack', () => {
    const root = document.createElement('div');
    let called = false;
    renderFixture(root, () => { called = true; });
    root.querySelector<HTMLButtonElement>('.dm-pc-back')!.click();
    expect(called).toBe(true);
  });
});

describe('renderPriceChart hover / focus readout', () => {
  it('hovering a row focuses its own trace and pins the readout to its latest point', () => {
    const root = document.createElement('div');
    renderFixture(root);
    const svg = root.querySelector('svg.dm-pc-svg')!;
    const rows = root.querySelectorAll<HTMLElement>('.dm-pc-row');
    const traces = root.querySelectorAll('.dm-pc-trace');

    rows[1]!.dispatchEvent(new Event('mouseenter'));

    expect(svg.classList.contains('dm-pc-focused')).toBe(true);
    expect(traces[1]!.classList.contains('on')).toBe(true);
    expect(traces[0]!.classList.contains('on')).toBe(false);
    expect(rows[1]!.classList.contains('dm-pc-row--lit')).toBe(true);

    // Alpha's (h1) latest recorded price is 0.4 at bucket 110 — the readout
    // must show exactly that recorded value, not an interpolated one.
    const priceTag = root.querySelector('.dm-pc-tag')!;
    expect(priceTag.textContent).toBe((0.4 + 0.01).toFixed(2));
  });

  it('keyboard focus on a row triggers the same readout as hovering it', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderFixture(root);
    const rows = root.querySelectorAll<HTMLElement>('.dm-pc-row');
    const traces = root.querySelectorAll('.dm-pc-trace');

    rows[0]!.dispatchEvent(new Event('focus'));

    expect(traces[0]!.classList.contains('on')).toBe(true);
    expect(rows[0]!.classList.contains('dm-pc-row--lit')).toBe(true);

    rows[0]!.dispatchEvent(new Event('blur'));
    expect(traces[0]!.classList.contains('on')).toBe(false);
    expect(rows[0]!.classList.contains('dm-pc-row--lit')).toBe(false);
    root.remove();
  });

  it('leaving a row clears the focus state entirely', () => {
    const root = document.createElement('div');
    renderFixture(root);
    const svg = root.querySelector('svg.dm-pc-svg')!;
    const rows = root.querySelectorAll<HTMLElement>('.dm-pc-row');

    rows[0]!.dispatchEvent(new Event('mouseenter'));
    rows[0]!.dispatchEvent(new Event('mouseleave'));

    expect(svg.classList.contains('dm-pc-focused')).toBe(false);
    expect(root.querySelector('.dm-pc-marker')!.classList.contains('on')).toBe(false);
  });
});
