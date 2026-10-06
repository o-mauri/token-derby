import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';

/** Which settings tab has unsaved edits, and the question asked before leaving it. The shell shows the question. */
@Injectable({ providedIn: 'root' })
export class DraftRegistry {
  private readonly dirty = signal<ReadonlySet<string>>(new Set());
  readonly dirtyTab = computed(() => [...this.dirty()][0] ?? null);
  // The open question, answered by the shell's confirm.
  readonly asking = signal<{ tab: string; answer: (leave: boolean) => void } | null>(null);

  constructor() {
    // The browser's own prompt covers closing or reloading the tab.
    inject(DOCUMENT).defaultView?.addEventListener('beforeunload', (e) => {
      if (this.dirtyTab()) e.preventDefault();
    });
  }

  set(tab: string, isDirty: boolean): void {
    this.dirty.update((s) => {
      const next = new Set(s);
      if (isDirty) next.add(tab); else next.delete(tab);
      return next;
    });
  }

  ask(): Promise<boolean> {
    const tab = this.dirtyTab();
    if (!tab) return Promise.resolve(true);
    return new Promise((resolve) => this.asking.set({ tab, answer: (leave) => {
      this.asking.set(null);
      if (leave) this.dirty.set(new Set());
      resolve(leave);
    } }));
  }
}

export const unsavedChangesGuard: CanDeactivateFn<unknown> = () => inject(DraftRegistry).ask();
