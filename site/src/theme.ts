export type ThemeId =
  | 'derby'
  | 'midnight'
  | 'turf'
  | 'photo'
  | 'london'
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
  { id: 'london', label: 'London' },
  { id: 'chromatic', label: 'Chromatic Circuit' },
  /* Phosphor before Matrix: same palette, and Phosphor is the calmer of the two
     (backdrop rain only), so the pair reads quiet-then-loud in the dropdown. */
  { id: 'phosphor', label: 'Phosphor' },
  { id: 'matrix', label: 'Matrix' },
];

export const DEFAULT_THEME: ThemeId = 'derby';

export type EventTheme = { id: ThemeId; tag: string };

/** Runs a themed event: on the first load after `tag` changes, every browser is
 *  flipped to `id` once, whatever it had saved, and the picker works normally
 *  from then on. Set to null to end the event; bump the tag to run one again.
 *  Pointing it at DEFAULT_THEME ends an event properly — null alone would leave
 *  the last event's id saved in every browser it flipped.
 *  Mirrored by the pre-paint script in public/index.html — keep in sync. */
export const EVENT_THEME: EventTheme | null = { id: 'derby', tag: '2026-09-derby-reset' };

/** Also read by the pre-paint inline script in public/index.html — keep in sync. */
export const THEME_STORAGE_KEY = 'td_theme';

/** Records the tag of the last event this browser was flipped by. */
export const EVENT_STORAGE_KEY = 'td_theme_event';

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

/** The theme for this page load, applying a pending event flip if there is one.
 *  Unlike readTheme this writes: recording the tag is what makes the flip
 *  one-shot, and writing the id is what lets the picker preselect it. */
export function resolveTheme(event: EventTheme | null = EVENT_THEME): ThemeId {
  if (!event) return readTheme();
  try {
    if (localStorage.getItem(EVENT_STORAGE_KEY) === event.tag) return readTheme();
    localStorage.setItem(EVENT_STORAGE_KEY, event.tag);
    localStorage.setItem(THEME_STORAGE_KEY, event.id);
  } catch {
    // Storage blocked: the event still shows, it just shows again every load.
  }
  return event.id;
}

export function applyTheme(id: ThemeId, doc: Document = document): void {
  doc.documentElement.dataset.theme = id;
  ensureRainBackdrop(doc);
}

/** The shared rain backdrop: Matrix's falling glyphs, London's rain. Themes
 *  that want neither hide it in CSS.
 *
 *  Built here rather than written into the page shells because there are seven
 *  of them (index plus the previews) and all of them honour the theme picker.
 *  It is markup at all, where it used to be a `body::before`, because the fall
 *  is a transform and a transform moves a whole element, so the three parallax
 *  layers each need a box of their own. See .rain-backdrop in styles.css for
 *  why the fall has to be a transform. */
function ensureRainBackdrop(doc: Document): void {
  if (!doc.body || doc.querySelector('.rain-backdrop')) return;
  const backdrop = doc.createElement('div');
  backdrop.className = 'rain-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) backdrop.appendChild(doc.createElement('i'));
  doc.body.prepend(backdrop);
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
export function initTheme(
  doc: Document = document,
  event: EventTheme | null = EVENT_THEME,
): ThemeId {
  const id = resolveTheme(event);
  applyTheme(id, doc);
  return id;
}
