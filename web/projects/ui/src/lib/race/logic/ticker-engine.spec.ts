import { FILL_BUFFER_PX, MIN_GAP_PX, MIN_GAP_PX_LEAGUE, SPEED_PX_PER_S, type TickerCell } from './ticker';
import { TickerEngine } from './ticker-engine';

const cell = (name: string): TickerCell => ({ kind: 'order', position: 1, horseName: name, valueText: '1', isLeader: true });
const label: TickerCell = { kind: 'label', text: 'Premier', groupClass: 'ticker-div-1' };

/** Runs frames, measuring every rendered cell at `w` px, like the browser would. */
function run(engine: TickerEngine, frames: number, viewport: number, w = 100, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) {
    const measured = new Map(engine.slots.filter((s) => s.width === null).map((s) => [s.key, w]));
    engine.frame(dt, viewport, measured);
  }
}

describe('TickerEngine', () => {
  it('is empty until it has cells', () => {
    const e = new TickerEngine();
    run(e, 5, 800);
    expect(e.slots).toEqual([]);
  });

  it('only adds the next cell once the last one has been measured', () => {
    const e = new TickerEngine();
    e.setCells([cell('A'), cell('B')]);
    e.frame(0, 800, new Map());
    expect(e.slots.map((s) => s.emit)).toEqual([{ kind: 'cell', cell: cell('A') }]);
    e.frame(0, 800, new Map());
    expect(e.slots.length).toBe(1);
  });

  it('fills the viewport plus a buffer, then stops adding', () => {
    const e = new TickerEngine();
    e.setCells([cell('A'), cell('B'), cell('C'), cell('D'), cell('E'), cell('F'), cell('G'), cell('H'), cell('I'), cell('J')]);
    run(e, 40, 500, 100, 0);
    const width = e.slots.reduce((sum, s) => sum + (s.width ?? 0), 0);
    expect(width).toBeGreaterThanOrEqual(500 + FILL_BUFFER_PX);
    expect(width).toBeLessThan(500 + FILL_BUFFER_PX + 100 + 1);
  });

  it('stretches the loop seam so even a short pass clears the screen before repeating', () => {
    const e = new TickerEngine();
    e.setCells([cell('A'), cell('B')]);
    run(e, 10, 800, 100, 0);
    const seam = e.slots.find((s) => s.emit.kind === 'seam')!;
    expect(seam.width).toBe(Math.max(MIN_GAP_PX, 800 - 200 + MIN_GAP_PX));
  });

  it('uses the wider seam for league batches with division labels', () => {
    const e = new TickerEngine();
    e.setCells([label, cell('A')]);
    run(e, 10, 300, 100, 0);
    expect(e.slots.find((s) => s.emit.kind === 'seam')!.width).toBe(Math.max(MIN_GAP_PX_LEAGUE, 300 - 200 + MIN_GAP_PX_LEAGUE));
  });

  it('scrolls at a steady speed and drops cells once fully off the left edge', () => {
    const e = new TickerEngine();
    e.setCells([cell('A'), cell('B'), cell('C')]);
    run(e, 10, 300, 100, 0);
    const firstKey = e.slots[0]!.key;
    run(e, 1, 300, 100, 0.05);
    expect(e.offset).toBeCloseTo(SPEED_PX_PER_S * 0.05, 5);
    run(e, 16, 300, 100, 0.1); // 1.6s at 70px/s carries the first 100px cell off screen
    expect(e.slots[0]!.key).not.toBe(firstKey);
    expect(e.offset).toBeLessThan(100);
  });

  it('caps a long frame so a background tab does not jump the ticker', () => {
    const e = new TickerEngine();
    e.setCells([cell('A')]);
    run(e, 5, 100, 400, 0);
    run(e, 1, 100, 400, 5);
    expect(e.offset).toBeCloseTo(SPEED_PX_PER_S * 0.1, 5);
  });

  it('holds still while paused', () => {
    const e = new TickerEngine();
    e.setCells([cell('A')]);
    run(e, 5, 100, 400, 0);
    e.paused = true;
    run(e, 3, 100, 400, 0.05);
    expect(e.offset).toBe(0);
  });

  it('keeps the current pass running and swaps in a new batch only at the seam', () => {
    const e = new TickerEngine();
    e.setCells([cell('A'), cell('B')]);
    run(e, 1, 150, 100, 0); // A is on screen, mid-pass
    e.setCells([cell('C')]);
    // Record every slot ever mounted, since early ones scroll off as the ticker runs.
    const seen = new Map<number, string>();
    for (let i = 0; i < 80; i++) {
      run(e, 1, 150, 100, 0.1);
      for (const s of e.slots) seen.set(s.key, s.emit.kind === 'cell' && s.emit.cell.kind === 'order' ? s.emit.cell.horseName : '|');
    }
    expect([...seen.values()].slice(0, 6)).toEqual(['A', 'B', '|', 'C', '|', 'C']);
  });
});
