import { describe, it, expect } from 'vitest';
import { CHANGELOG } from '../src/changelog.js';

describe('CHANGELOG data', () => {
  it('is non-empty', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it('every entry has a valid shape', () => {
    for (const e of CHANGELOG) {
      expect(['site', 'cli']).toContain(e.component);
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(e.changes)).toBe(true);
      expect(e.changes.length).toBeGreaterThan(0);
      for (const c of e.changes) expect(c.trim().length).toBeGreaterThan(0);
    }
  });

  it('is ordered newest-first (non-increasing date)', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(CHANGELOG[i - 1]!.date >= CHANGELOG[i]!.date).toBe(true);
    }
  });
});
