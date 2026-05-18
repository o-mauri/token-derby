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

  it('maps "/org/myteam" to org', () => {
    expect(parseRoute('/org/myteam')).toEqual({ type: 'org', orgName: 'myteam' });
  });

  it('preserves org-name case (orgs are case-sensitive)', () => {
    expect(parseRoute('/org/MyTeam')).toEqual({ type: 'org', orgName: 'MyTeam' });
  });

  it('strips a trailing slash on org route', () => {
    expect(parseRoute('/org/team42/')).toEqual({ type: 'org', orgName: 'team42' });
  });

  it('rejects org names > 12 chars or with bad chars', () => {
    expect(parseRoute('/org/abcdefghijklm')).toEqual({ type: 'not-found' });
    expect(parseRoute('/org/with space')).toEqual({ type: 'not-found' });
  });

  it('returns not-found for unknown paths', () => {
    expect(parseRoute('/foo')).toEqual({ type: 'not-found' });
    expect(parseRoute('/race/')).toEqual({ type: 'not-found' });
    expect(parseRoute('/race/ABC/extra')).toEqual({ type: 'not-found' });
    expect(parseRoute('/org/')).toEqual({ type: 'not-found' });
  });
});
