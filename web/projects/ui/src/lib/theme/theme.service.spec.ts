import { TestBed } from '@angular/core/testing';
import { EVENT_STORAGE_KEY, EVENT_THEME, THEME_STORAGE_KEY } from './themes';
import { EVENT_THEME_TOKEN, STORAGE, ThemeService } from './theme.service';

function make(event = EVENT_THEME) {
  TestBed.configureTestingModule({ providers: [{ provide: EVENT_THEME_TOKEN, useValue: event }] });
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    vi.restoreAllMocks();
  });

  it('applies a pending event theme once and records it', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'turf');
    const s = make({ id: 'london', tag: 'evt-1' });
    expect(s.theme()).toBe('london');
    expect(localStorage.getItem(EVENT_STORAGE_KEY)).toBe('evt-1');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('london');
  });

  it('uses the stored theme once the event has been seen', () => {
    localStorage.setItem(EVENT_STORAGE_KEY, 'evt-1');
    localStorage.setItem(THEME_STORAGE_KEY, 'turf');
    expect(make({ id: 'london', tag: 'evt-1' }).theme()).toBe('turf');
  });

  it('falls back to derby for an unknown stored id', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(make(null).theme()).toBe('derby');
  });

  it('falls back to derby when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(make(null).theme()).toBe('derby');
  });

  it('still shows a pending event when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(make({ id: 'matrix', tag: 'evt-2' }).theme()).toBe('matrix');
  });

  it('set() updates the signal, the document and storage', () => {
    const s = make(null);
    s.set('london');
    TestBed.tick();
    expect(s.theme()).toBe('london');
    expect(document.documentElement.dataset['theme']).toBe('london');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('london');
  });

  it('reads and writes through the injected storage', () => {
    const store = new Map<string, string>([[THEME_STORAGE_KEY, 'matrix']]);
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    TestBed.configureTestingModule({ providers: [{ provide: EVENT_THEME_TOKEN, useValue: null }, { provide: STORAGE, useValue: fake }] });
    const s = TestBed.inject(ThemeService);
    expect(s.theme()).toBe('matrix');
    s.set('turf');
    expect(store.get(THEME_STORAGE_KEY)).toBe('turf');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('writes the initial theme to the document', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'photo');
    make(null);
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('photo');
  });
});
