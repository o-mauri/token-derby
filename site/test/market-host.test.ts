import { describe, it, expect } from 'vitest';
import { isMarketHost, marketHref, derbymarketRedirect, MARKET_ORIGIN } from '../src/market/host.js';

describe('isMarketHost', () => {
  it('is true on the market subdomain', () => {
    expect(isMarketHost('market.tokenderby.co.uk', '')).toBe(true);
  });
  it('is false on the other production hosts, even with the override', () => {
    expect(isMarketHost('app.tokenderby.co.uk', '?host=market')).toBe(false);
  });
  it('is false on the apex, even with the override', () => {
    expect(isMarketHost('tokenderby.co.uk', '?host=market')).toBe(false);
  });
  it('does not treat other market.* hosts as the market', () => {
    expect(isMarketHost('market.example.com', '')).toBe(false);
  });
  it('honours ?host=market on local hosts', () => {
    expect(isMarketHost('localhost', '?host=market')).toBe(true);
    expect(isMarketHost('localhost', '')).toBe(false);
  });
});

describe('marketHref', () => {
  it('stays relative on the market host', () => {
    expect(marketHref('/stackone', 'market.tokenderby.co.uk')).toBe('/stackone');
  });
  it('points the app host at the market origin', () => {
    expect(marketHref('/', 'app.tokenderby.co.uk')).toBe(`${MARKET_ORIGIN}/`);
  });
  it('keeps local harnesses on the same origin with the override', () => {
    expect(marketHref('/stackone', 'localhost')).toBe('/stackone?host=market');
  });
});

describe('derbymarketRedirect', () => {
  it('keeps the sign-in fragment on local harnesses', () => {
    expect(derbymarketRedirect('localhost', '#code=ABC')).toBe('/?host=market#code=ABC');
  });
  it('treats the apex as production', () => {
    expect(marketHref('/', 'tokenderby.co.uk')).toBe(`${MARKET_ORIGIN}/`);
  });
});
