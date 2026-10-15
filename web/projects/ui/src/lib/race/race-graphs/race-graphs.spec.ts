import { TestBed } from '@angular/core/testing';
import type { GetRaceSeriesResponse, HorseView } from '@token-derby/shared';
import { RaceGraphs } from './race-graphs';

const horse = (id: string, name: string, rank: number, division?: number) =>
  ({ horse_id: id, name, rank, division, colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' } } as HorseView);
const SERIES: GetRaceSeriesResponse = {
  start_ms: 0, end_ms: 600_000,
  horses: [
    { horse_id: 'a', points: [{ t: 60_000, d: 40 }] },
    { horse_id: 'b', points: [{ t: 60_000, d: 10 }] },
    { horse_id: 'c', points: [] },
  ],
};
const FIELD = [horse('a', 'Alpha', 1, 1), horse('b', 'Beta', 2, 2), horse('c', 'Gamma', 3, 2)];

async function render(inputs: Record<string, unknown>) {
  const f = TestBed.createComponent(RaceGraphs);
  for (const [k, v] of Object.entries({ series: SERIES, failed: false, horses: FIELD, divisionNames: null, nowMs: 600_000, ...inputs })) {
    f.componentRef.setInput(k, v);
  }
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}
const options = (el: HTMLElement, sel: string) => [...el.querySelectorAll<HTMLElement>(`${sel} [role="option"]`)];
const text = (el: HTMLElement) => el.querySelector('.body')?.textContent?.replace(/\s+/g, ' ').trim();

describe('RaceGraphs', () => {
  it('offers the two charts, cumulative first and selected', async () => {
    const { el } = await render({});
    const tabs = options(el, '.modes');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Cumulative', 'Tokens / min']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('td-race-chart .title')?.textContent).toBe('Cumulative scored tokens');
  });

  it('switches chart when a tab is picked', async () => {
    const { f, el } = await render({});
    options(el, '.modes')[1]!.click();
    await f.whenStable();
    expect(el.querySelector('td-race-chart .title')?.textContent).toBe('Tokens produced / min (30-min avg)');
  });

  it('shows no division filter for a non-league race', async () => {
    const { el } = await render({});
    expect(el.querySelector('.divisions')).toBeNull();
  });

  it('offers All plus each division in a league, and charts only the chosen one', async () => {
    const { f, el } = await render({ divisionNames: ['Premier', 'Championship'] });
    expect(options(el, '.divisions').map((o) => o.textContent?.trim())).toEqual(['All', 'Premier', 'Championship']);
    expect(el.querySelectorAll('td-race-chart .legend .item').length).toBe(3);
    options(el, '.divisions')[1]!.click();
    await f.whenStable();
    expect([...el.querySelectorAll('td-race-chart .legend .item')].map((i) => i.textContent?.trim())).toEqual(['Alpha']);
  });

  it('keeps each horse\'s colour when the division filter changes', async () => {
    const { f, el } = await render({ divisionNames: ['Premier', 'Championship'] });
    const betaColour = () => [...el.querySelectorAll<HTMLElement>('td-race-chart .legend .item')].find((i) => i.textContent?.includes('Beta'))!
      .querySelector<HTMLElement>('.chip')!.style.background;
    const before = betaColour();
    options(el, '.divisions')[2]!.click();
    await f.whenStable();
    expect(betaColour()).toBe(before);
  });

  it('shows the loader until the first series arrives', async () => {
    const { el } = await render({ series: null });
    expect(el.querySelector('.body td-loader')).not.toBeNull();
  });

  it('says it is retrying when loading failed', async () => {
    const { el } = await render({ failed: true });
    expect(text(el)).toBe("Couldn't load the graphs. Retrying shortly.");
  });

  it('waits for data when nobody has scored yet', async () => {
    const none: GetRaceSeriesResponse = { ...SERIES, horses: SERIES.horses.map((h) => ({ ...h, points: [] })) };
    const { el } = await render({ series: none });
    expect(text(el)).toBe('No token data yet. Check back in a minute.');
  });

  it('says a division has no data yet when its runners have no points', async () => {
    const series: GetRaceSeriesResponse = { ...SERIES, horses: [SERIES.horses[0]!, { horse_id: 'b', points: [] }, SERIES.horses[2]!] };
    const { f, el } = await render({ series, divisionNames: ['Premier', 'Championship'] });
    options(el, '.divisions')[2]!.click();
    await f.whenStable();
    expect(text(el)).toBe('No data for this division yet.');
  });

  it('falls back to All when the chosen division disappears', async () => {
    const { f, el } = await render({ divisionNames: ['Premier', 'Championship'] });
    options(el, '.divisions')[2]!.click();
    await f.whenStable();
    f.componentRef.setInput('divisionNames', ['Premier']);
    await f.whenStable();
    expect(options(el, '.divisions').find((o) => o.getAttribute('aria-selected') === 'true')?.textContent?.trim()).toBe('All');
  });
});
