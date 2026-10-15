import { xpBarModel } from './xp-bar.model';

describe('xpBarModel', () => {
  it('describes a gain within the same level', () => {
    // 60 XP is 10/117 into level 2; +80 makes 140, 90/117 into level 2.
    expect(xpBarModel(60, 80)).toEqual({
      levelBefore: 2, levelAfter: 2, levelledUp: false, awarded: 80,
      oldPct: (10 / 117) * 100, newPct: (90 / 117) * 100, into: 90, forLevel: 117, maxed: false,
    });
  });

  it('describes a level up: the old fill, then the new progress in the next level', () => {
    const m = xpBarModel(140, 40); // 180 XP: level 3, 13/174
    expect(m.levelledUp).toBe(true);
    expect([m.levelBefore, m.levelAfter]).toEqual([2, 3]);
    expect(m.oldPct).toBeCloseTo((90 / 117) * 100);
    expect(m.newPct).toBeCloseTo((13 / 174) * 100);
    expect([m.into, m.forLevel]).toEqual([13, 174]);
  });

  it('treats a race with no XP as no change', () => {
    const m = xpBarModel(85, 0);
    expect(m.levelledUp).toBe(false);
    expect(m.oldPct).toBe(m.newPct);
  });

  it('shows a full bar at the maximum level', () => {
    const m = xpBarModel(99_000, 999);
    expect(m.maxed).toBe(true);
    expect(m.newPct).toBe(100);
    expect(m.forLevel).toBeNull();
  });
});
