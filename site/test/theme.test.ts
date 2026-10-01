import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  EVENT_THEME,
  EVENT_STORAGE_KEY,
  isThemeId,
  readTheme,
  resolveTheme,
  applyTheme,
  setTheme,
  initTheme,
} from '../src/theme.js';
import { createThemePicker } from '../src/render/theme-picker.js';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme registry', () => {
  it('keeps Derby as the first option and the default', () => {
    expect(THEMES[0]!.id).toBe('derby');
    expect(DEFAULT_THEME).toBe('derby');
  });

  it('has unique ids and a label for every theme', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of THEMES) expect(t.label.length).toBeGreaterThan(0);
  });

  it('validates ids', () => {
    expect(isThemeId('derby')).toBe(true);
    expect(isThemeId('midnight')).toBe(true);
    expect(isThemeId('nope')).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(7)).toBe(false);
  });
});

describe('readTheme', () => {
  it('defaults when nothing is stored', () => {
    expect(readTheme()).toBe('derby');
  });

  it('returns a valid stored theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'turf');
    expect(readTheme()).toBe('turf');
  });

  it('falls back to the default for a junk stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'chartreuse');
    expect(readTheme()).toBe('derby');
  });
});

describe('applyTheme / setTheme', () => {
  it('applyTheme sets data-theme without persisting', () => {
    applyTheme('photo');
    expect(document.documentElement.dataset.theme).toBe('photo');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('setTheme applies and persists', () => {
    setTheme('midnight');
    expect(document.documentElement.dataset.theme).toBe('midnight');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight');
  });

  it('initTheme applies the stored theme and returns it', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'turf');
    expect(initTheme(document, null)).toBe('turf');
    expect(document.documentElement.dataset.theme).toBe('turf');
  });

  it('initTheme applies the default when storage is empty', () => {
    expect(initTheme(document, null)).toBe('derby');
    expect(document.documentElement.dataset.theme).toBe('derby');
  });
});

describe('resolveTheme (event flip)', () => {
  const event = { id: 'london', tag: 'test-event' } as const;

  it('flips a browser that had another theme saved', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'matrix');
    expect(resolveTheme(event)).toBe('london');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('london');
  });

  it('applies to a browser with nothing saved', () => {
    expect(resolveTheme(event)).toBe('london');
  });

  it('flips only once, so a later pick survives the next load', () => {
    resolveTheme(event);
    setTheme('turf');
    expect(resolveTheme(event)).toBe('turf');
  });

  it('fires again when the tag changes', () => {
    resolveTheme(event);
    setTheme('turf');
    expect(resolveTheme({ id: 'london', tag: 'test-event-2' })).toBe('london');
  });

  it('touches nothing when no event is running', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'turf');
    expect(resolveTheme(null)).toBe('turf');
    expect(localStorage.getItem(EVENT_STORAGE_KEY)).toBeNull();
  });

  it('still applies the event theme when storage is blocked', () => {
    const real = localStorage;
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const install = (value: unknown): void => {
      Object.defineProperty(globalThis, 'localStorage', { value, configurable: true });
    };
    install(blocked);
    try {
      expect(resolveTheme(event)).toBe('london');
      // Nothing was recorded, so it simply applies again on the next load.
      expect(resolveTheme(event)).toBe('london');
    } finally {
      install(real);
    }
  });

  it('initTheme runs the flip and paints the event theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'matrix');
    expect(initTheme(document, event)).toBe('london');
    expect(document.documentElement.dataset.theme).toBe('london');
  });

  it('readTheme stays a pure read', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'matrix');
    expect(readTheme()).toBe('matrix');
    expect(localStorage.getItem(EVENT_STORAGE_KEY)).toBeNull();
  });
});

// The theme id list is necessarily duplicated in three places: the TS registry,
// the CSS :root[data-theme=…] blocks, and the pre-paint script in index.html.
// These guard against the three drifting apart.
describe('theme id duplication', () => {
  const read = (rel: string): string =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('every non-default theme has a CSS block, and vice versa', () => {
    const css = read('../public/styles.css');
    // Not anchored to `:root[…]`: themes that share a palette are grouped as
    // `:root:is([data-theme="a"], [data-theme="b"])`, where only the first
    // attribute follows `:root`. What matters here is which ids appear at all.
    const inCss = [...css.matchAll(/\[data-theme="([a-z-]+)"\]/g)].map((m) => m[1]!);
    // Derby is intentionally absent: it lives in plain :root so it is also the
    // no-JS default, and data-theme="derby" simply falls through to it.
    const expected = THEMES.map((t) => t.id).filter((id) => id !== DEFAULT_THEME);
    expect([...new Set(inCss)].sort()).toEqual([...expected].sort());
  });

  it('every variable a theme overrides is actually consumed by a rule', () => {
    const css = read('../public/styles.css');
    const themeBlocks = [...css.matchAll(/:root\[data-theme="[a-z-]+"\]\s*\{([^}]*)\}/g)];
    expect(themeBlocks.length).toBeGreaterThan(0);
    const overridden = new Set(
      themeBlocks.flatMap((b) => [...b[1]!.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]!)),
    );
    // A theme token nobody reads is a silent no-op (e.g. declaring --label-box
    // but leaving the rule on a literal hex).
    const unused = [...overridden].filter((name) => !css.includes(`var(${name}`));
    expect(unused).toEqual([]);
  });

  // Theme art is committed rather than built (see scripts/gen-london-skyline.mjs),
  // so a renamed or unregenerated asset fails silently as a blank background.
  it('every image referenced by the stylesheet exists', () => {
    const css = read('../public/styles.css');
    const refs = [...new Set([...css.matchAll(/url\('(img\/[^']+)'\)/g)].map((m) => m[1]!))];
    expect(refs.length).toBeGreaterThan(0);
    // Resolved through the same `read` the tests above use. A literal
    // `new URL('…', import.meta.url)` does NOT work here: happy-dom replaces the
    // global URL with one that resolves relative paths against
    // http://localhost:3000/, and only the indirection through `read`'s
    // parameter survives Vite's transform with a file: URL.
    const missing = refs.filter((ref) => {
      try {
        read(`../public/${ref}`);
        return false;
      } catch {
        return true;
      }
    });
    expect(missing).toEqual([]);
  });

  it('the pre-paint script in index.html lists exactly the registered ids', () => {
    const html = read('../public/index.html');
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    const list = html.match(/\[((?:\s*'[a-z-]+',?)+)\]\.indexOf\(t\)/);
    expect(list, 'pre-paint theme id array not found in index.html').not.toBeNull();
    const ids = [...list![1]!.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!);
    expect(ids).toEqual(THEMES.map((t) => t.id));
  });

  // The pre-paint script has to run the event flip itself, or the first load of
  // an event shows the old theme and snaps to the new one once the bundle loads.
  it('the pre-paint script mirrors EVENT_THEME', () => {
    const html = read('../public/index.html');
    expect(html).toContain(`localStorage.getItem('${EVENT_STORAGE_KEY}')`);
    const literal = (name: string): string => {
      const m = html.match(new RegExp(`var ${name} = (null|'[a-z0-9-]+');`));
      expect(m, `${name} not found in the pre-paint script`).not.toBeNull();
      return m![1]!;
    };
    expect(literal('eventTag')).toBe(EVENT_THEME ? `'${EVENT_THEME.tag}'` : 'null');
    expect(literal('eventTheme')).toBe(EVENT_THEME ? `'${EVENT_THEME.id}'` : 'null');
  });
});

describe('createThemePicker', () => {
  it('renders one option per registered theme, in order', () => {
    const picker = createThemePicker(document);
    const select = picker.querySelector('select')!;
    const options = Array.from(select.options);
    expect(options.map((o) => o.value)).toEqual(THEMES.map((t) => t.id));
    expect(options.map((o) => o.textContent)).toEqual(THEMES.map((t) => t.label));
  });

  it('preselects the stored theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'photo');
    const select = createThemePicker(document).querySelector('select')!;
    expect(select.value).toBe('photo');
  });

  it('applies and persists the theme on change', () => {
    const select = createThemePicker(document).querySelector('select')!;
    select.value = 'turf';
    select.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset.theme).toBe('turf');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('turf');
  });

  it('ignores a change to an unknown value', () => {
    applyTheme('derby');
    const select = createThemePicker(document).querySelector('select')!;
    const rogue = document.createElement('option');
    rogue.value = 'chartreuse';
    select.appendChild(rogue);
    select.value = 'chartreuse';
    select.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset.theme).toBe('derby');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
