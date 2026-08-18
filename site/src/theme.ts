export type ThemeId =
  | 'derby'
  | 'midnight'
  | 'turf'
  | 'photo'
  | 'chromatic'
  | 'phosphor'
  | 'matrix';

export type Theme = { id: ThemeId; label: string };

/** Dropdown order. `derby` is the original palette and stays first/default. */
export const THEMES: readonly Theme[] = [
  { id: 'derby', label: 'Derby' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'turf', label: 'Turf' },
  { id: 'photo', label: 'Photo Finish' },
  { id: 'chromatic', label: 'Chromatic Circuit' },
  /* Phosphor before Matrix: same palette, and Phosphor is the calmer of the two
     (backdrop rain only), so the pair reads quiet-then-loud in the dropdown. */
  { id: 'phosphor', label: 'Phosphor' },
  { id: 'matrix', label: 'Matrix' },
];

export const DEFAULT_THEME: ThemeId = 'derby';

/** Also read by the pre-paint inline script in public/index.html — keep in sync. */
export const THEME_STORAGE_KEY = 'td_theme';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value);
}

export function readTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME; // storage blocked (private mode / cookies off)
  }
}

export function applyTheme(id: ThemeId, doc: Document = document): void {
  doc.documentElement.dataset.theme = id;
}

export function setTheme(id: ThemeId, doc: Document = document): void {
  applyTheme(id, doc);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Non-fatal: the theme applies for this page load, it just won't persist.
  }
}

/** index.html applies the stored theme pre-paint to avoid a flash of Derby; this
 *  covers entry points without that inline script (the preview pages) and keeps
 *  the attribute authoritative after bundle load. */
export function initTheme(doc: Document = document): ThemeId {
  const id = readTheme();
  applyTheme(id, doc);
  return id;
}
