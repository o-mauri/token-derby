import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    document.body.classList.remove('tv');
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('renders the page frame with the theme picker in its header', async () => {
    const f = TestBed.createComponent(App);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.classList).toContain('td-app-root');
    expect(el.querySelector('td-page header td-theme-picker td-select button[aria-haspopup="listbox"]')).not.toBeNull();
  });

  it('applies the current theme to the document', async () => {
    const f = TestBed.createComponent(App);
    await f.whenStable();
    expect(document.documentElement.dataset['theme']).toBeTruthy();
  });

});
