import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Small pixel horse head, cropped from the race sprite (cols 24-31, rows 2-7). The site's logo mark.
export const FACE_ROWS: readonly string[] = [
  '..MMM...', '..MMM...', '.MBBEBB.', '.MBBEBB.', 'MBBBBBBB', 'MBBBBBBB', 'MBBB....', 'MBBB....', 'BB......', 'BB......',
];

/** Face colours; same keys as a horse's own colours, so a horse's `colors` can be passed straight in. */
export type HorseFaceColors = { body?: string; mane?: string; eye?: string };

// The logo's own colours: brown face, cream mane (pops against black), dark eye.
const DEFAULTS = { body: '#8B4513', mane: '#f5e9d3', eye: '#000000' };
const PART: Record<string, string> = { B: 'var(--face-body)', M: 'var(--face-mane)', E: 'var(--face-eye)' };
const PIXELS = FACE_ROWS.flatMap((row, y) => [...row].flatMap((c, x) => (PART[c] ? [{ x, y, fill: PART[c]! }] : [])));

@Component({
  selector: 'td-horse-face',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--face-body]': 'resolved().body',
    '[style.--face-mane]': 'resolved().mane',
    '[style.--face-eye]': 'resolved().eye',
  },
  template: `
    <svg viewBox="0 0 8 10" shape-rendering="crispEdges" aria-hidden="true">
      @for (p of pixels; track $index) { <svg:rect [attr.x]="p.x" [attr.y]="p.y" width="1" height="1" [attr.fill]="p.fill" /> }
    </svg>
  `,
  styles: `
    :host { display: inline-block; height: 1em; aspect-ratio: 8 / 10; }
    svg { display: block; width: 100%; height: 100%; }
  `,
})
export class HorseFace {
  readonly colors = input<HorseFaceColors>({});

  protected readonly pixels = PIXELS;
  protected readonly resolved = computed(() => ({ ...DEFAULTS, ...this.colors() }));
}
