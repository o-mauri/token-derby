import { describe, it, expect } from 'vitest';
import { parseRoute, parseMarketRoute } from '../src/route.js';
import { derbymarketRedirect } from '../src/market/host.js';

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

  it('maps "/org/myteam/live" to org-live', () => {
    expect(parseRoute('/org/myteam/live')).toEqual({ type: 'org-live', orgName: 'myteam' });
    expect(parseRoute('/org/MyTeam/live/')).toEqual({ type: 'org-live', orgName: 'MyTeam' });
  });

  it('rejects bad org-live paths', () => {
    expect(parseRoute('/org/abcdefghijklm/live')).toEqual({ type: 'not-found' });
    expect(parseRoute('/org/myteam/liveX')).toEqual({ type: 'not-found' });
    expect(parseRoute('/org//live')).toEqual({ type: 'not-found' });
  });

  it('maps "/catalog" to catalog', () => {
    expect(parseRoute('/catalog')).toEqual({ type: 'catalog' });
    expect(parseRoute('/catalog/')).toEqual({ type: 'catalog' });
  });

  it('maps "/about" to about', () => {
    expect(parseRoute('/about')).toEqual({ type: 'about' });
    expect(parseRoute('/about/')).toEqual({ type: 'about' });
  });

  it('routes /derbymarket', () => {
    expect(parseRoute('/derbymarket')).toEqual({ type: 'derbymarket' });
    expect(parseRoute('/derbymarket/')).toEqual({ type: 'derbymarket' });
  });

  it('does not route a lookalike', () => {
    expect(parseRoute('/derbymarket/foo').type).toBe('not-found');
  });

  it('returns not-found for unknown paths', () => {
    expect(parseRoute('/foo')).toEqual({ type: 'not-found' });
    expect(parseRoute('/race/')).toEqual({ type: 'not-found' });
    expect(parseRoute('/race/ABC/extra')).toEqual({ type: 'not-found' });
    expect(parseRoute('/org/')).toEqual({ type: 'not-found' });
  });

  it('maps "/privacy" to privacy', () => {
    expect(parseRoute('/privacy')).toEqual({ type: 'privacy' });
  });

  it('strips a trailing slash from /privacy', () => {
    expect(parseRoute('/privacy/')).toEqual({ type: 'privacy' });
  });
});

describe('parseRoute on the market host', () => {
  const m = (path: string) => parseRoute(path, 'market.tokenderby.co.uk', '');
  it('routes the root to the picker', () => {
    expect(m('/')).toEqual({ type: 'market', market: { type: 'picker' } });
  });
  it('routes an org name', () => {
    expect(m('/stackone')).toEqual({ type: 'market', market: { type: 'org', orgName: 'stackone' } });
  });
  it('routes an org and join code, upper-casing the code', () => {
    expect(m('/StackOne/q79ksh')).toEqual({ type: 'market', market: { type: 'race', orgName: 'StackOne', joinCode: 'Q79KSH' } });
  });
  it('treats anything else as not found', () => {
    expect(m('/a/b/c')).toEqual({ type: 'market', market: { type: 'not-found' } });
    expect(parseMarketRoute('/way-too-long-org-name')).toEqual({ type: 'not-found' });
  });
  it('leaves app routing alone off the market host', () => {
    expect(parseRoute('/org/stackone')).toEqual({ type: 'org', orgName: 'stackone' });
    expect(parseRoute('/derbymarket', 'app.tokenderby.co.uk', '')).toEqual({ type: 'derbymarket' });
  });
  it('carries the sign-in code to the market host', () => {
    expect(derbymarketRedirect('app.tokenderby.co.uk', '#code=ABC')).toBe('https://market.tokenderby.co.uk/#code=ABC');
  });
});
