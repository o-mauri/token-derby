import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { RESIZE_OBSERVER, apiErrors } from '@token-derby/ui';
import { routes } from '../app.routes';
import { ADMIN_KEYS, ADMIN_STORAGE } from '../session/admin-session';
import { adminAuth } from '../session/admin-auth';
import { MemoryStorage } from './memory-storage';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
export const SIGNED_IN = { [ADMIN_KEYS.token]: 'tok' };

/** Opens `url` in the real admin routes with a fake backend; signed in unless `seed` says otherwise. */
export async function openAdmin(url: string, seed: Record<string, string> = SIGNED_IN) {
  const storage = new MemoryStorage(seed);
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([adminAuth, apiErrors])),
      provideHttpClientTesting(),
      { provide: ADMIN_STORAGE, useValue: storage },
      { provide: RESIZE_OBSERVER, useValue: null },
    ],
  });
  const harness = await RouterTestingHarness.create();
  const settle = async () => { for (let i = 0; i < 4; i++) { await tick(); await harness.fixture.whenStable(); } };
  await harness.navigateByUrl(url);
  await settle();
  const el = () => harness.fixture.nativeElement as HTMLElement;
  const click = async (sel: string | Element) => { (typeof sel === 'string' ? el().querySelector<HTMLElement>(sel)! : sel as HTMLElement).click(); await settle(); };
  const type = async (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new Event('input')); await settle(); };
  const http = TestBed.inject(HttpTestingController);
  return { harness, el, settle, click, type, http, storage, router: () => TestBed.inject(Router) };
}
