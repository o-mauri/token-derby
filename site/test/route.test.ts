import { describe, it, expect } from 'vitest';
import { parseRoute } from '../src/route.js';

describe('parseRoute', () => {
  it('maps "/" to home', () => {
    expect(parseRoute('/')).toEqual({ type: 'home' });
  });

  it('maps "" to home', () => {
    expect(parseRoute('')).toEqual({ type: 'home' });
  });

  it('maps "/race/ABC123" to race with upper-case code', () => {
    expect(parseRoute('/race/ABC123')).toEqual({ type: 'race', joinCode: 'ABC123' });
  });

  it('upper-cases lower-case race codes from the URL', () => {
    expect(parseRoute('/race/abc123')).toEqual({ type: 'race', joinCode: 'ABC123' });
  });

  it('strips a trailing slash', () => {
    expect(parseRoute('/race/ABC123/')).toEqual({ type: 'race', joinCode: 'ABC123' });
  });

  it('returns not-found for unknown paths', () => {
    expect(parseRoute('/foo')).toEqual({ type: 'not-found' });
    expect(parseRoute('/race/')).toEqual({ type: 'not-found' });
    expect(parseRoute('/race/ABC/extra')).toEqual({ type: 'not-found' });
  });
});
