import { TestBed } from '@angular/core/testing';
import type { SeasonView } from '../logic/league';
import { SeasonStandingsTable } from './season-standings';

const C = { body: '#111111', mane: '#222222', tail: '#222222', saddle: '#333333' };
const VIEW: SeasonView = {
  season: 2, round: 3, total: 8, champion: null,
  divisions: [{ division: 1, name: 'Premier', rows: [
    { stableId: 'b', name: 'Bolt', owner: 'Bob', colors: C, hat: null, rank: 1, points: 39, gain: 15, movement: null, zone: null },
    { stableId: 'c', name: 'Comet', owner: 'Alice', colors: C, hat: null, rank: 2, points: 30, gain: 20, movement: 1, zone: null },
    { stableId: 'a', name: 'Ada', owner: 'Dan', colors: null, hat: null, rank: 3, points: 28, gain: 0, movement: -1, zone: null },
    { stableId: 'n', name: 'Newbie', owner: 'Frank', colors: C, hat: null, rank: 4, points: 15, gain: 15, movement: 'new', zone: 'relegate' },
  ] }, { division: 2, name: 'Championship', rows: [
    { stableId: 'o', name: 'Oak', owner: 'Eve', colors: C, hat: null, rank: 1, points: 35, gain: 20, movement: null, zone: 'promote' },
  ] }],
};

async function render(view: SeasonView) {
  const f = TestBed.createComponent(SeasonStandingsTable);
  f.componentRef.setInput('view', view);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('SeasonStandingsTable', () => {
  it('heads the table with the season and round', async () => {
    const el = await render(VIEW);
    expect(el.querySelector('.heading')!.textContent!.trim()).toBe('Season 2 · after round 3 of 8');
  });

  it('shows points, this race’s gain and movement for each horse', async () => {
    const rows = [...(await render(VIEW)).querySelectorAll('.division')[0]!.querySelectorAll('.row:not(.head)')];
    expect(rows.map((x) => x.querySelector('.move')!.textContent!.trim())).toEqual(['–', '▲1', '▼1', 'NEW']);
    expect(rows[1]!.querySelector('.points')!.textContent!.trim()).toBe('30');
    expect(rows[1]!.querySelector('.gain')!.textContent!.trim()).toBe('+20');
    expect(rows[2]!.querySelector('.gain')).toBeNull();
    expect(rows[2]!.querySelector('td-horse')).toBeNull();
  });

  it('marks the promotion and relegation places, with a legend', async () => {
    const el = await render(VIEW);
    expect(el.querySelector('.row.promote .name')!.textContent).toBe('Oak');
    expect(el.querySelector('.row.relegate .name')!.textContent).toBe('Newbie');
    expect(el.querySelector('.legend')).not.toBeNull();
  });

  it('shows the champion line on the season finale only', async () => {
    expect((await render(VIEW)).querySelector('.champion')).toBeNull();
    TestBed.resetTestingModule();
    const el = await render({ ...VIEW, round: 8, champion: { name: 'Bolt', owner: 'Bob', division: 'Premier' } });
    expect(el.querySelector('.champion')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('SEASON 2 CHAMPION · Bolt (Bob) · Premier');
  });
});
