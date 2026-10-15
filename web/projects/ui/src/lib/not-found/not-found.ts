import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Horse, type HorseColors } from '../horse/horse';
import { Button } from '../button/button';
import { bubbleRects } from './bubble';

/** A message part; `{ strong }` marks the value the visitor typed. Always rendered as text. */
export type NotFoundMessagePart = string | { strong: string };

const HORSE: HorseColors = { body: '#8B4513', mane: '#2b1a0e', tail: '#2b1a0e', saddle: '#d94848' };

/** "Nothing here" block: the loader's porthole, frozen, with a lost horse thinking "?".
 *  `back` only emits; the page decides where to navigate. */
@Component({
  selector: 'td-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, Button],
  host: { role: 'alert' },
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
})
export class NotFound {
  readonly title = input.required<string>();
  readonly message = input.required<NotFoundMessagePart[]>();
  readonly backLabel = input.required<string>();
  readonly back = output<void>();

  protected readonly horse = HORSE;
  protected readonly bubble = bubbleRects();
  protected readonly parts = computed(() =>
    this.message().map((p) => (typeof p === 'string' ? { text: p, strong: false } : { text: p.strong, strong: true })),
  );
}
