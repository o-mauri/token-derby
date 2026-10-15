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
  { id: 'phosphor', label: 'Phosphor' },
  { id: 'matrix', label: 'Matrix' },
];

export const DEFAULT_THEME: ThemeId = 'derby';

export type EventTheme = { id: ThemeId; tag: string };

/** A themed event flips every browser to `id` once per new `tag`. Mirrored by
 *  the pre-paint script in each app's index.html. */
export const EVENT_THEME: EventTheme | null = { id: 'derby', tag: '2026-09-derby-reset' };

export const THEME_STORAGE_KEY = 'td_theme';
export const EVENT_STORAGE_KEY = 'td_theme_event';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value);
}
