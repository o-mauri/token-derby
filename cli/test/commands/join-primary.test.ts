import { describe, it, expect } from 'vitest';
import { parsePrimaryFlag } from '../../src/commands/join.js';

describe('parsePrimaryFlag', () => {
  it('parses --primary <model>', () => {
    expect(parsePrimaryFlag(['--primary', 'codex'])).toBe('codex');
    expect(parsePrimaryFlag(['--primary', 'gemini'])).toBe('gemini');
  });
  it('parses --primary=<model>', () => {
    expect(parsePrimaryFlag(['--primary=claude'])).toBe('claude');
  });
  it('returns null when the flag is absent', () => {
    expect(parsePrimaryFlag([])).toBeNull();
  });
  it('throws on an invalid model', () => {
    expect(() => parsePrimaryFlag(['--primary', 'gpt'])).toThrow();
  });
});
