import { STAMINA_BAR_PX, staminaBand, staminaFillPx } from './stamina';

describe('staminaBand', () => {
  it.each([
    [100, 'high'], [51, 'high'], [50, 'mid'], [20, 'mid'], [19, 'low'], [0, 'low'],
  ] as const)('%i with a floor of 20 is %s', (value, band) => expect(staminaBand(value, 20)).toBe(band));
});

describe('staminaFillPx', () => {
  it('fills the whole bar at full stamina', () => expect(staminaFillPx(100)).toBe(STAMINA_BAR_PX));
  it('scales and rounds', () => expect(staminaFillPx(50)).toBe(19));
  it('keeps a 2px sliver while alive so a weak horse never reads as dead', () => expect(staminaFillPx(1)).toBe(2));
  it('is empty at zero or below', () => {
    expect(staminaFillPx(0)).toBe(0);
    expect(staminaFillPx(-5)).toBe(0);
  });
});
