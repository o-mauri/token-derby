import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { GetJockeyResponse, StableHorse } from '@token-derby/shared';
import { RESIZE_OBSERVER, apiErrors } from '@token-derby/ui';
import { routes } from '../app.routes';
import { MemoryStorage } from '../session/memory-storage';
import { provideSession } from '../session/session';
import { SESSION_KEYS, SESSION_STORAGE } from '../session/session-storage';
import { sessionAuth } from '../session/session.interceptor';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const SIGNED_IN = { [SESSION_KEYS.token]: 'tok', [SESSION_KEYS.uid]: 'u1', [SESSION_KEYS.name]: 'Omar' };
const C = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };
const JOCKEY: GetJockeyResponse = { user_id: 'u1', display_name: 'Omar', created_at: '2026-05-14T10:00:00Z' };
const HORSES: StableHorse[] = [
  { stable_horse_id: 'h2', name: 'Comet', colors: C, created_at: 'x', xp: 420, races_entered: 12, wins: 1, podiums: 4, total_tokens: 900_000, total_finishing_position: 42, hats: [] },
  { stable_horse_id: 'h1', name: 'Gallopz', colors: C, created_at: 'x', xp: 900, races_entered: 30, wins: 4, podiums: 9, total_tokens: 1_234_000, total_finishing_position: 75,
    hats: [{ id: 'party_hat', obtained_at: '2026-01-02T00:00:00Z' }, { id: 'cowboy_hat', obtained_at: '2026-05-01T00:00:00Z' }], equipped_hat: 0 },
];

async function open(seed: Record<string, string> = SIGNED_IN) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([sessionAuth, apiErrors])),
      provideHttpClientTesting(),
      provideSession(),
      { provide: SESSION_STORAGE, useValue: new MemoryStorage(seed) },
      { provide: RESIZE_OBSERVER, useValue: null },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/paddock');
  const settle = async () => { for (let i = 0; i < 4; i++) { await tick(); await harness.fixture.whenStable(); } };
  await settle();
  const el = () => harness.routeNativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  const answer = async (horses: StableHorse[] = HORSES) => {
    http.expectOne('/api/jockey/me').flush(JOCKEY);
    http.expectOne('/api/jockey/me/horses').flush({ horses });
    await settle();
  };
  const click = async (sel: string) => { el().querySelector<HTMLElement>(sel)!.click(); await settle(); };
  const text = (sel: string) => el().querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();
  return { el, http, settle, answer, click, text };
}

describe('Paddock page', () => {
  it('shows loaders in CAREER and STABLE until both loads arrive', async () => {
    const p = await open();
    expect(p.el().querySelectorAll('td-panel.career td-loader, td-panel.stable td-loader').length).toBe(2);
    p.http.expectOne('/api/jockey/me').flush(JOCKEY);
    await p.settle();
    expect(p.el().querySelector('td-panel.career td-loader')).not.toBeNull();
    p.http.expectOne('/api/jockey/me/horses').flush({ horses: HORSES });
    await p.settle();
    expect(p.el().querySelector('td-loader')).toBeNull();
  });

  it('totals your horses and says when you joined', async () => {
    const p = await open();
    await p.answer();
    expect(p.text('.career .name')).toBe('Omar');
    expect(p.text('.career .joined')).toBe('joined May 2026');
    const totals = [...p.el().querySelectorAll('.career .total')].map((t) => `${t.querySelector('dt')?.textContent?.trim()} ${t.querySelector('dd')?.textContent?.trim()}`);
    expect(totals).toEqual(['Horses 2', 'Races 42', 'Wins 5', 'Podiums 13', 'Tokens 2.13M', 'XP 1.32K']);
  });

  it('lists the stable by wins, each horse in its equipped hat', async () => {
    const p = await open();
    await p.answer();
    expect([...p.el().querySelectorAll('.stable .horse .name')].map((n) => n.textContent?.trim())).toEqual(['Gallopz', 'Comet']);
    expect(p.el().querySelector('.stable .horse td-horse .horse-hat-party_hat')).not.toBeNull();
    expect(p.text('.stable .horse .stats')).toContain('Avg 2.5');
  });

  it('opens and closes a horse\'s hat collection, newest first', async () => {
    const p = await open();
    await p.answer();
    await p.click('.stable .horse button.hats-toggle');
    expect(p.el().querySelector('.stable .horse button.hats-toggle')!.getAttribute('aria-expanded')).toBe('true');
    expect([...p.el().querySelectorAll('.hats .hat-name')].map((n) => n.textContent?.trim())).toEqual(['Cowboy Hat', 'Party Hat']);
    expect(p.el().querySelectorAll('.hats .hat')[1]!.querySelector('.equipped')).not.toBeNull();
    await p.click('.stable .horse button.hats-toggle');
    expect(p.el().querySelector('.hats')).toBeNull();
  });

  it('says when a horse has no hats, and when there are no horses', async () => {
    const p = await open();
    await p.answer();
    await p.click('.stable .horse:nth-child(2) button.hats-toggle');
    expect(p.text('.hats')).toContain('No hats yet.');
    TestBed.resetTestingModule();
    const q = await open();
    await q.answer([]);
    expect(q.text('.stable .empty')).toBe('No horses yet. Run token-derby to enter your first race.');
  });

  it('shows an error when a load fails, and Retry loads both again', async () => {
    const p = await open();
    p.http.expectOne('/api/jockey/me').flush(JOCKEY);
    p.http.expectOne('/api/jockey/me/horses').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Err' });
    await p.settle();
    expect(p.text('.career .failed')).toContain("Couldn't load your page.");
    await p.click('.career .failed button');
    await p.answer();
    expect(p.el().querySelector('.failed')).toBeNull();
    expect(p.el().querySelectorAll('.stable .horse').length).toBe(2);
  });

  it('keeps Trophies and Achievements as coming soon', async () => {
    const p = await open();
    await p.answer();
    expect(p.text('td-panel.trophies')).toContain('Coming soon');
    expect(p.text('td-panel.achievements')).toContain('Coming soon');
  });

  it('puts you in the breadcrumb', async () => {
    const p = await open();
    expect([...p.el().querySelectorAll('td-crumbs .part')].map((x) => x.textContent?.trim())).toEqual(['Omar', 'Paddock']);
  });

  it('asks you to sign in when signed out, coming back here', async () => {
    const p = await open({});
    expect(p.el().querySelector('td-google-button a')?.getAttribute('href')).toBe('/api/auth/google/start?return_to=%2Fpaddock');
    p.http.expectNone('/api/jockey/me/horses');
  });
});
