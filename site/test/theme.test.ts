import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeId,
  readTheme,
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
    expect(initTheme()).toBe('turf');
    expect(document.documentElement.dataset.theme).toBe('turf');
  });

  it('initTheme applies the default when storage is empty', () => {
    expect(initTheme()).toBe('derby');
    expect(document.documentElement.dataset.theme).toBe('derby');
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
    const inCss = [...css.matchAll(/:root\[data-theme="([a-z-]+)"\]/g)].map((m) => m[1]!);
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

  it('the pre-paint script in index.html lists exactly the registered ids', () => {
    const html = read('../public/index.html');
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    const list = html.match(/\[((?:\s*'[a-z-]+',?)+)\]\.indexOf\(t\)/);
    expect(list, 'pre-paint theme id array not found in index.html').not.toBeNull();
    const ids = [...list![1]!.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!);
    expect(ids).toEqual(THEMES.map((t) => t.id));
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
