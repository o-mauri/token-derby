import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

  it('serves v2 routes with td_site=v2', () => {
    expect(rewrite('/', { td_site: 'v2' })).toBe('/v2/index.html');
    expect(rewrite('/paddock', { td_site: 'v2' })).toBe('/v2/index.html');
  });

  it('never moves a file between builds, whatever the cookie', () => {
    for (const uri of ['/main.js', '/styles.css', '/chunk-ABC.js', '/favicon.svg', '/img/x.png']) {
      expect(rewrite(uri, { td_site: 'v2' }), uri).toBe(uri);
    }
    for (const cookies of [{}, { td_site: 'v2' }] as Record<string, string>[]) {
      expect(rewrite('/v2/main-X.js', cookies)).toBe('/v2/main-X.js');
      expect(rewrite('/v2/media/VT323.woff2', cookies)).toBe('/v2/media/VT323.woff2');
    }
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

  // The deployed v2 build (ng build site -c production,optin) and the v1 build it shares the bucket root with.
  const V2_DIST = path.resolve(__dirname, '..', '..', 'web', 'dist', 'site-optin', 'browser');
  const V1_DIST = path.resolve(__dirname, '..', '..', 'site', 'dist');
  const walk = (d: string, prefix = ''): string[] =>
    readdirSync(d).flatMap((e) => statSync(path.join(d, e)).isDirectory()
      ? walk(path.join(d, e), `${prefix}/${e}`)
      : [`${prefix}/${e}`]);
  const v2Index = () => readFileSync(path.join(V2_DIST, 'index.html'), 'utf8');
  const v2Refs = () => [...v2Index().matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1]!)
    .filter((ref) => !/^https?:/.test(ref));

  it('loads every v2 script, stylesheet and preload from /v2/', () => {
    const refs = v2Refs().filter((ref) => ref !== '/favicon.svg');
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref, ref).toMatch(/^\/v2\//);
      expect(existsSync(path.join(V2_DIST, ref.slice(4))), ref).toBe(true);
    }
  });

  it('ships every other v2 file identically in v1, which serves it from the root', () => {
    const viaV2 = new Set(v2Refs().filter((ref) => ref.startsWith('/v2/')).map((ref) => ref.slice(3)));
    // Hashed build output is fetched relative to main.js, so it resolves under /v2/ too.
    const built = /^\/(main|chunk|styles|polyfills)-[\w-]+\.(js|css)$|^\/media\//;
    const rootFiles = walk(V2_DIST).filter((f) => f !== '/index.html' && !viaV2.has(f) && !built.test(f));
    expect(rootFiles.length).toBeGreaterThan(0);
    for (const f of rootFiles) {
      const v1 = path.join(V1_DIST, f);
      expect(existsSync(v1), `${f} is missing from site/dist`).toBe(true);
      expect(readFileSync(v1).equals(readFileSync(path.join(V2_DIST, f))), `${f} differs from v1's copy`).toBe(true);
    }
  });
});
