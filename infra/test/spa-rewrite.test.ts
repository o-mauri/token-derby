import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { SPA_REWRITE_CODE } from '../lib/spa-rewrite';

// The deployed CloudFront function decides "file or SPA route?" from whether the
// path contains a dot. That is a proxy for the real question, so these tests pin
// the two ways it could silently go wrong: a route that gains a dot, or a shipped
// asset that has none. Either would be served as the wrong thing in production.
const handler = new Function(`${SPA_REWRITE_CODE}; return handler;`)() as
  (event: { request: { uri: string } }) => { uri: string };

const rewrite = (uri: string): string => handler({ request: { uri } }).uri;

/** Mirrors the routes in site/src/route.ts — keep in step when adding one. */
const SPA_ROUTES = [
  '/', '/race/ABC123', '/org/acme', '/org/acme/live',
  '/catalog', '/about', '/privacy', '/org-manager', '/cli', '/link',
];

function filesIn(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, prefix: string) => {
    for (const entry of readdirSync(d)) {
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full, `${prefix}/${entry}`);
      else out.push(`${prefix}/${entry}`);
    }
  };
  walk(dir, '');
  return out;
}

describe('SPA rewrite function', () => {
  it('sends every site route to the shell', () => {
    for (const route of SPA_ROUTES) {
      expect(rewrite(route), `${route} should reach the SPA shell`).toBe('/index.html');
    }
  });

  for (const app of ['site', 'admin'] as const) {
    it(`leaves every built ${app} asset untouched`, () => {
      const dist = path.resolve(__dirname, '..', '..', app, 'dist');
      const assets = filesIn(dist);

      expect(assets.length).toBeGreaterThan(0);
      for (const asset of assets) {
        expect(rewrite(asset), `${asset} would be swallowed by the SPA rewrite`).toBe(asset);
      }
    });
  }

  it('would misclassify a route containing a dot — the constraint this rule carries', () => {
    // Documents why site routes must stay alphanumeric. If a route like
    // /org/acme.co is ever added, it lands here instead of the shell.
    expect(rewrite('/org/acme.co')).not.toBe('/index.html');
  });
});
