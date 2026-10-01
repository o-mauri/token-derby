import { describe, it, expect, vi, afterEach } from 'vitest';
import { getMarkets, listOrganisations, exchangeCode } from '../../src/derbymarket/api.js';

const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

const setUrl = (u: string) => (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(u);

describe('derbymarket api on a production host', () => {
  afterEach(() => { setUrl('http://localhost:3000/'); localStorage.clear(); });

  it('sends every call to the API origin, not the page origin', async () => {
    setUrl('https://market.tokenderby.co.uk/stackone');
    localStorage.setItem('td_market_session', 'tok');
    const f = vi.fn(async () => ok());
    await getMarkets('ABC', f as unknown as typeof fetch);
    await listOrganisations(f as unknown as typeof fetch);
    await exchangeCode('c', f as unknown as typeof fetch).catch(() => {});
    expect(f.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      'https://api.tokenderby.co.uk/races/ABC/markets',
      'https://api.tokenderby.co.uk/organisations',
      'https://api.tokenderby.co.uk/web-sessions/exchange',
    ]);
  });
});
