import { describe, it, expect } from 'vitest';
import { scale, linePath, smoothPath } from '../src/render/chart-paths.js';

describe('scale', () => {
  it('maps a value linearly between ranges', () => {
    expect(scale(5, 0, 10, 0, 100)).toBe(50);
  });
  it('returns rMin when the domain is degenerate', () => {
    expect(scale(5, 4, 4, 10, 90)).toBe(10);
  });
});

describe('linePath', () => {
  it('returns empty string for no points', () => {
    expect(linePath([])).toBe('');
  });
  it('builds an M…L polyline path', () => {
    expect(linePath([[0, 0], [10, 20]])).toBe('M0.0,0.0 L10.0,20.0');
  });
});

describe('smoothPath', () => {
  it('falls back to a line for fewer than 2 points', () => {
    expect(smoothPath([[1, 2]])).toBe('M1.0,2.0');
  });
  it('produces a cubic-bezier path through >=2 points', () => {
    const d = smoothPath([[0, 0], [10, 10], [20, 0]]);
    expect(d.startsWith('M0.0,0.0')).toBe(true);
    expect(d).toContain('C');
  });
});
