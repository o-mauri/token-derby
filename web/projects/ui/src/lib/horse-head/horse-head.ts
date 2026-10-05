import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { hatById } from '@token-derby/shared';
import type { HorseColors } from '../horse/horse';
import { FACE_ROWS } from '../horse-face/horse-face';
import { HatPixels, type WornHat } from '../hat/hat-pixels';

/** 'light' disc behind dark horses, 'dark' behind light ones, from the body colour's luminance. */
export function discTone(body: string): 'light' | 'dark' {
  let hex = body.replace('#', '');
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 0.45 ? 'light' : 'dark';
}

// The face sits at sprite columns 24-31, rows 2-11, so hats (drawn in sprite coordinates) land on it as on the horse.
const FACE_X = 24;
const FACE_Y = 2;

/** A horse's head and hat in a contrasting disc: a compact stand-in for the whole sprite in dense lists. */
@Component({
  selector: 'td-horse-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HatPixels],
  host: { 'aria-hidden': 'true', '[attr.data-tone]': 'tone()', '[style.--size]': 'size()' },
  template: `
    <svg viewBox="21.5 -2.5 13 13" shape-rendering="crispEdges">
      @for (p of face(); track $index) { <svg:rect [attr.x]="p.x" [attr.y]="p.y" width="1" height="1" [attr.fill]="p.fill" /> }
      @if (hatDef(); as h) { <svg:g tdHatPixels [hat]="h" [variant]="hat()?.variant ?? 0" /> }
    </svg>
  `,
  styleUrl: './horse-head.scss',
})
export class HorseHead {
  readonly colors = input.required<HorseColors>();
  readonly hat = input<WornHat | null>(null);
  readonly size = input('1.8rem');

  protected readonly tone = computed(() => discTone(this.colors().body));
  protected readonly hatDef = computed(() => {
    const worn = this.hat();
    return worn ? hatById(worn.id) ?? null : null;
  });
  protected readonly face = computed(() => {
    const { body, mane } = this.colors();
    // The eye is fixed sprite art, the same on every horse.
    const fill: Record<string, string> = { B: body, M: mane, E: '#000000' };
    return FACE_ROWS.flatMap((row, y) => [...row].flatMap((c, x) => (fill[c] ? [{ x: FACE_X + x, y: FACE_Y + y, fill: fill[c]! }] : [])));
  });
}
