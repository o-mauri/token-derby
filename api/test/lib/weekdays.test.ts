import { describe, it, expect } from 'vitest';
import { parseWeekdays } from '@token-derby/shared';

describe('parseWeekdays', () => {
  it('parses a range', () => {
    expect(parseWeekdays('mon-fri')).toEqual([1, 2, 3, 4, 5]);
  });
  it('parses a comma list (and sorts + dedupes)', () => {
    expect(parseWeekdays('fri,mon,mon,wed')).toEqual([1, 3, 5]);
  });
  it('parses a mix of ranges and singles', () => {
    expect(parseWeekdays('mon-tue,sat')).toEqual([1, 2, 6]);
  });
  it('is case-insensitive and trims whitespace', () => {
    expect(parseWeekdays(' MON , Wed ')).toEqual([1, 3]);
  });
  it('returns null for unknown day names', () => {
    expect(parseWeekdays('mon,funday')).toBeNull();
  });
  it('returns null for a reversed range', () => {
    expect(parseWeekdays('fri-mon')).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(parseWeekdays('')).toBeNull();
  });
  it('returns null for a multi-hyphen token', () => {
    expect(parseWeekdays('mon-tue-wed')).toBeNull();
  });
  it('returns null for an empty range bound', () => {
    expect(parseWeekdays('mon--fri')).toBeNull();
  });
});
