import { describe, it, expect } from 'vitest';
import { clockMinutes, localDate, binOf, binCentre, cellIndex, formatClock, GRID, TRI_CELLS } from '../../src/attendance/clock.js';

describe('clockMinutes', () => {
  it('reads London summer time', () => {
    expect(clockMinutes('2026-07-01T08:30:00Z', 'Europe/London')).toBe(570);
  });
  it('reads London winter time', () => {
    expect(clockMinutes('2026-12-01T08:30:00Z', 'Europe/London')).toBe(510);
  });
  it('handles the October clock change', () => {
    // Clocks went back at 01:00 UTC on 2026-10-25; 09:00 UTC is 09:00 GMT.
    expect(clockMinutes('2026-10-25T09:00:00Z', 'Europe/London')).toBe(540);
    expect(clockMinutes('2026-10-24T09:00:00Z', 'Europe/London')).toBe(600);
  });
  it('reads midnight as 0, not 1440', () => {
    expect(clockMinutes('2026-07-01T23:00:00Z', 'Europe/London')).toBe(0);
  });
  it('keeps seconds as a fraction', () => {
    expect(clockMinutes('2026-12-01T09:00:30Z', 'UTC')).toBe(540.5);
  });
});

describe('localDate', () => {
  it('uses the local calendar day', () => {
    expect(localDate('2026-07-01T23:30:00Z', 'Europe/London')).toBe('2026-07-02');
  });
});

describe('grid helpers', () => {
  it('clamps bins to the grid', () => {
    expect(binOf(-5)).toBe(0);
    expect(binOf(0)).toBe(0);
    expect(binOf(5.99)).toBe(0);
    expect(binOf(6)).toBe(1);
    expect(binOf(1440)).toBe(GRID - 1);
  });
  it('centres bins', () => {
    expect(binCentre(0)).toBe(3);
    expect(binCentre(239)).toBe(1437);
  });
  it('indexes rows by arrival', () => {
    expect(cellIndex(2, 5)).toBe(2 * GRID + 5);
  });
  it('counts the upper triangle', () => {
    expect(TRI_CELLS).toBe(28920);
  });
  it('formats clock minutes', () => {
    expect(formatClock(570)).toBe('09:30');
    expect(formatClock(1440)).toBe('24:00');
  });
});
