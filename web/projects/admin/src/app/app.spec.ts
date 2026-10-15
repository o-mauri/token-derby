import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    document.body.classList.remove('tv');
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('is a bare frame around the routed page, which owns its own header', async () => {
    const f = TestBed.createComponent(App);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.classList).toContain('td-app-root');
    expect(el.querySelector('router-outlet')).not.toBeNull();
    expect(el.querySelector('td-page')).toBeNull();
  });

  it('applies the current theme to the document', async () => {
    const f = TestBed.createComponent(App);
    await f.whenStable();
    expect(document.documentElement.dataset['theme']).toBeTruthy();
  });

});
