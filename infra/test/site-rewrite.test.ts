import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { SITE_REWRITE_CODE } from '../lib/site-rewrite';

type Req = { uri: string; cookies?: Record<string, { value: string }> };
const handler = new Function(`${SITE_REWRITE_CODE}; return handler;`)() as (event: { request: Req }) => Req;
const rewrite = (uri: string, cookies: Record<string, string> = {}): string =>
  handler({ request: { uri, cookies: Object.fromEntries(Object.entries(cookies).map(([k, value]) => [k, { value }])) } }).uri;

describe('site rewrite', () => {
  it('serves v1 without the cookie, as before', () => {
    expect(rewrite('/')).toBe('/index.html');
    expect(rewrite('/org/acme')).toBe('/index.html');
    expect(rewrite('/main.js')).toBe('/main.js');
  });

  it('serves v2 routes and files with td_site=v2', () => {
    expect(rewrite('/', { td_site: 'v2' })).toBe('/v2/index.html');
    expect(rewrite('/paddock', { td_site: 'v2' })).toBe('/v2/index.html');
    expect(rewrite('/main-ABC123.js', { td_site: 'v2' })).toBe('/v2/main-ABC123.js');
    expect(rewrite('/media/VT323.woff2', { td_site: 'v2' })).toBe('/v2/media/VT323.woff2');
  });

  it('ignores other cookies and other td_site values', () => {
    expect(rewrite('/', { theme: 'v2', other: 'x' })).toBe('/index.html');
    expect(rewrite('/', { td_site: 'v1' })).toBe('/index.html');
    expect(rewrite('/', { td_site: 'V2 ' })).toBe('/index.html');
    expect(rewrite('/', { other: 'x', td_site: 'v2' })).toBe('/v2/index.html');
  });

  it('always serves the TV view from v1', () => {
    for (const uri of ['/org/acme/live', '/org/Acme/live/', '/org/X1/live']) {
      expect(rewrite(uri, { td_site: 'v2' }), uri).toBe('/index.html');
    }
    expect(rewrite('/org/acme/league', { td_site: 'v2' })).toBe('/v2/index.html');
  });

  it('copes with a request that has no cookies object', () => {
    expect(handler({ request: { uri: '/x' } }).uri).toBe('/index.html');
  });

  it('maps every built v2 asset to its v2/ key', () => {
    const dist = path.resolve(__dirname, '..', '..', 'web', 'dist', 'site', 'browser');
    const walk = (d: string, prefix: string): string[] =>
      readdirSync(d).flatMap((e) => statSync(path.join(d, e)).isDirectory()
        ? walk(path.join(d, e), `${prefix}/${e}`)
        : [`${prefix}/${e}`]);
    const assets = walk(dist, '');
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      expect(rewrite(asset, { td_site: 'v2' }), asset).toBe(`/v2${asset}`);
    }
  });
});
