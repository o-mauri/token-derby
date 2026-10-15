import { homeScale } from './home-scale';

describe('homeScale', () => {
  it('never shrinks for a narrow window, so phones and tablets stay 1:1', () => {
    expect(homeScale(390, 844)).toBe(1);
    expect(homeScale(900, 1000)).toBe(1);
  });

  it('grows smoothly with the window, led by whichever side is tighter', () => {
    expect(homeScale(1366, 768)).toBeCloseTo(768 / 720);
    expect(homeScale(1440, 1080)).toBeCloseTo(1.2);
    expect(homeScale(1920, 1080)).toBeCloseTo(1.5);
    expect(homeScale(1680, 1080)).toBeGreaterThan(homeScale(1600, 1080));
  });

  it('shrinks a little for a short window so it still fits, but not past 0.8', () => {
    expect(homeScale(1920, 700)).toBeCloseTo(700 / 720);
    expect(homeScale(1920, 400)).toBe(0.8);
  });

  it('stops growing on very large screens', () => {
    expect(homeScale(3840, 2160)).toBe(1.8);
  });
});
