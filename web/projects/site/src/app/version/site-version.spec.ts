import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { REDIRECT } from '../session/redirect';
import { SiteVersion, v1PathFor } from './site-version';

describe('v1PathFor', () => {
  it('maps v2-only pages to their nearest v1 page', () => {
    expect(v1PathFor('/paddock')).toBe('/');
    expect(v1PathFor('/account')).toBe('/org-manager');
    expect(v1PathFor('/account/devices')).toBe('/org-manager');
    expect(v1PathFor('/org/acme/races')).toBe('/org/acme');
    expect(v1PathFor('/org/acme/league?season=2')).toBe('/org/acme');
    expect(v1PathFor('/org/acme/settings/racing')).toBe('/org/acme');
    expect(v1PathFor('/catalog/rare')).toBe('/catalog');
    expect(v1PathFor('/link-google')).toBe('/link');
  });

  it('keeps shared pages, query included, and drops any hash', () => {
    expect(v1PathFor('/org/acme')).toBe('/org/acme');
    expect(v1PathFor('/race/ABC?x=1')).toBe('/race/ABC?x=1');
    expect(v1PathFor('/#code=abc')).toBe('/');
  });
});

describe('SiteVersion', () => {
  it('clears the cookie and leaves for the v1 page', async () => {
    const go = vi.fn();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }]), { provide: REDIRECT, useValue: go }] });
    const doc = TestBed.inject(DOCUMENT);
    doc.cookie = 'td_site=v2; Path=/';
    await TestBed.inject(Router).navigateByUrl('/org/acme/league');
    TestBed.inject(SiteVersion).useV1();
    expect(doc.cookie).not.toContain('td_site=v2');
    expect(go).toHaveBeenCalledWith('/org/acme');
  });
});
