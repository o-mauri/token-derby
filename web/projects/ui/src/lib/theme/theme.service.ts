import { DOCUMENT, Injectable, InjectionToken, RendererFactory2, effect, inject, signal } from '@angular/core';
import {
  DEFAULT_THEME, EVENT_STORAGE_KEY, EVENT_THEME, EventTheme, THEME_STORAGE_KEY, ThemeId, isThemeId,
} from './themes';

/** The themed event in force; overridable so tests can drive the one-shot flip. */
export const EVENT_THEME_TOKEN = new InjectionToken<EventTheme | null>('EVENT_THEME', {
  factory: () => EVENT_THEME,
});

export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Where the chosen theme persists; null when the browser blocks storage outright. */
export const STORAGE = new InjectionToken<ThemeStorage | null>('THEME_STORAGE', {
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly storage = inject(STORAGE);
  private readonly renderer = inject(RendererFactory2).createRenderer(null, null);
  private readonly current = signal<ThemeId>(this.resolveInitial(inject(EVENT_THEME_TOKEN)));
  readonly theme = this.current.asReadonly();

  constructor() {
    effect(() => this.renderer.setAttribute(this.doc.documentElement, 'data-theme', this.current()));
  }

  set(id: ThemeId): void {
    this.current.set(id);
    this.write(THEME_STORAGE_KEY, id);
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  // Storage failures are non-fatal: the theme applies, it just won't persist.
  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // ignored
    }
  }

  private readStored(): ThemeId {
    const stored = this.read(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  }

  // Applies a pending event flip once; recording the tag is what makes it one-shot.
  private resolveInitial(event: EventTheme | null): ThemeId {
    if (!event || this.read(EVENT_STORAGE_KEY) === event.tag) return this.readStored();
    this.write(EVENT_STORAGE_KEY, event.tag);
    this.write(THEME_STORAGE_KEY, event.id);
    return event.id;
  }
}
