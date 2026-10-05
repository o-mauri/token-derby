import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterLink } from '@angular/router';
import { Button } from './button';

@Component({ template: '' })
class Target {}

@Component({
  imports: [Button, RouterLink],
  template: `<button td-button (click)="clicks = clicks + 1">Go</button><a td-button routerLink="/org/acme">Back</a>`,
})
class Host { clicks = 0; }

describe('Button', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'org/acme', component: Target }])] }));

  it('keeps native button behaviour and the shared class', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const btn = f.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.classList).toContain('td-button');
    btn.click();
    expect(f.componentInstance.clicks).toBe(1);
  });

  it('styles an anchor that navigates through the Angular router', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const a = f.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(a.classList).toContain('td-button');
    expect(a.getAttribute('href')).toBe('/org/acme');
    a.click();
    await f.whenStable();
    expect(TestBed.inject(Router).url).toBe('/org/acme');
  });

  it('offers a compact size', async () => {
    const f = TestBed.createComponent(SizeHost);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('button')!.classList.contains('sm')).toBe(true);
  });
});

@Component({ imports: [Button], template: `<button td-button size="sm">Go</button>` })
class SizeHost {}

