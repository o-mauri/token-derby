import { describe, it, expect } from 'vitest';
import { adjustEquippedAfterRemoval } from '../../src/lib/hat-removal.js';

describe('adjustEquippedAfterRemoval', () => {
  it('returns null when nothing is equipped', () => {
    expect(adjustEquippedAfterRemoval(null, 0)).toBeNull();
    expect(adjustEquippedAfterRemoval(undefined, 2)).toBeNull();
  });
  it('clears the equip when the equipped hat is removed', () => {
    expect(adjustEquippedAfterRemoval(2, 2)).toBeNull();
  });
  it('decrements when a hat before the equipped one is removed', () => {
    expect(adjustEquippedAfterRemoval(3, 1)).toBe(2);
    expect(adjustEquippedAfterRemoval(1, 0)).toBe(0);
  });
  it('leaves the equip untouched when a hat after it is removed', () => {
    expect(adjustEquippedAfterRemoval(0, 1)).toBe(0);
    expect(adjustEquippedAfterRemoval(2, 5)).toBe(2);
  });
});
