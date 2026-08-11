import { describe, it, expect } from 'vitest';
import { chartPoints, nearestPoint, assignLineColors } from '../src/derbymarket/render/chart.js';

const snap = (bucket: number, win: number) => ({
  race_id: 'r', bucket, computed_at: '', phantoms: 0,
  prices: [{ horse_id: 'h1', win, podium: 0.5, division: null, divisionPodium: null }],
});

describe('chartPoints', () => {
  it('maps buckets to x and probability to y, y inverted', () => {
    const pts = chartPoints([snap(100, 0), snap(200, 1)], 'h1', 'win', 100, 50);
    expect(pts[0]!.x).toBeCloseTo(0, 6);
    expect(pts[1]!.x).toBeCloseTo(100, 6);
    expect(pts[0]!.y).toBeCloseTo(50, 6);   // p=0 at the bottom
    expect(pts[1]!.y).toBeCloseTo(0, 6);    // p=1 at the top
  });
  it('skips snapshots where the horse has no market yet', () => {
    const before = { ...snap(50, 0), prices: [] };
    expect(chartPoints([before, snap(100, 0.4)], 'h1', 'win', 100, 50)).toHaveLength(1);
  });
  it('handles a single point without dividing by zero', () => {
    const pts = chartPoints([snap(100, 0.4)], 'h1', 'win', 100, 50);
    expect(pts).toHaveLength(1);
    expect(Number.isFinite(pts[0]!.x)).toBe(true);
  });
  it('returns nothing for an empty history', () => {
    expect(chartPoints([], 'h1', 'win', 100, 50)).toEqual([]);
  });
  it('shares the x domain across the whole history, not just the horse\'s own points — a late '
    + 'joiner starts partway across rather than snapping back to x=0', () => {
    // h1 has no price until bucket 150, halfway through a 100..200 window.
    const history = [
      { race_id: 'r', bucket: 100, computed_at: '', phantoms: 0, prices: [] },
      { race_id: 'r', bucket: 150, computed_at: '', phantoms: 0, prices: [{ horse_id: 'h1', win: 0.5, podium: 0.5, division: null, divisionPodium: null }] },
      { race_id: 'r', bucket: 200, computed_at: '', phantoms: 0, prices: [{ horse_id: 'h1', win: 0.6, podium: 0.5, division: null, divisionPodium: null }] },
    ];
    const pts = chartPoints(history, 'h1', 'win', 100, 50);
    expect(pts).toHaveLength(2);
    expect(pts[0]!.x).toBeCloseTo(50, 6); // halfway across the full 100..200 domain, not 0
  });
  it('skips a null division value rather than treating it as zero', () => {
    const history = [snap(100, 0.3)]; // division is null in the fixture
    expect(chartPoints(history, 'h1', 'division', 100, 50)).toEqual([]);
  });
});

describe('nearestPoint', () => {
  it('snaps to the closest recorded point rather than interpolating', () => {
    const pts = [
      { bucket: 0, price: 0.1, x: 0, y: 45 },
      { bucket: 5, price: 0.9, x: 100, y: 5 },
    ];
    expect(nearestPoint(pts, 40)).toBe(pts[0]);
    expect(nearestPoint(pts, 61)).toBe(pts[1]);
  });
  it('returns the sole point for a single-point series regardless of cursor position', () => {
    const pts = [{ bucket: 0, price: 0.4, x: 0, y: 30 }];
    expect(nearestPoint(pts, 999)).toBe(pts[0]);
  });
});

describe('assignLineColors', () => {
  it('keeps each horse\'s own silk when they are all distinct', () => {
    const colors = assignLineColors([
      { horse_id: 'a', silk: '#C8102E' },
      { horse_id: 'b', silk: '#0F6E6E' },
    ]);
    expect(colors.get('a')).toBe('#C8102E');
    expect(colors.get('b')).toBe('#0F6E6E');
  });
  it('falls back to a distinct palette colour when two silks are too close to tell apart', () => {
    const colors = assignLineColors([
      { horse_id: 'a', silk: '#7E93A3' },
      { horse_id: 'b', silk: '#7B909F' }, // near-identical grey-blue
    ]);
    expect(colors.get('a')).toBe('#7E93A3');
    expect(colors.get('b')).not.toBe('#7B909F');
    expect(colors.get('b')).not.toBe(colors.get('a'));
  });

  // Regression: an unbounded palette-search loop never terminated once all
  // slots were taken. 24 same-coloured horses (reachable at the race cap) reproduced it.
  it('terminates and assigns every horse a colour even when the palette is exhausted', () => {
    const horses = Array.from({ length: 24 }, (_, i) => ({ horse_id: `h${i}`, silk: '#8B4513' }));
    const colors = assignLineColors(horses);
    expect(colors.size).toBe(24);
    expect([...colors.values()].every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
  });

  it('does not hand the palette fallback a colour that clashes with one already assigned', () => {
    // '#e6194b' (palette slot 0) is ~43 RGB units from this real silk — under
    // the old exact-string-membership check it would have been handed out
    // regardless, despite reading as the same colour on a thin line.
    const colors = assignLineColors([
      { horse_id: 'a', silk: '#C8102E' },
      { horse_id: 'b', silk: '#C8102E' }, // forces b down the palette-fallback path
    ]);
    expect(colors.get('a')).not.toBe(colors.get('b'));
    expect(colors.get('b')).not.toBe('#e6194b');
  });

  it('replaces a black silk rather than drawing an invisible line on every (dark) theme', () => {
    const colors = assignLineColors([{ horse_id: 'a', silk: '#000000' }]);
    expect(colors.get('a')).not.toBe('#000000');
  });
});
