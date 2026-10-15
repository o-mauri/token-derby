import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import { GRID, SPRITE_HEIGHT, SPRITE_WIDTH, hatById, type SlotTag } from '@token-derby/shared';
import { HatPixels, type WornHat } from '../hat/hat-pixels';

export type HorseColors = { body: string; mane: string; tail: string; saddle: string };
type Cell = { x: number; y: number; fill: string };

// Hoof colour is fixed in the sprite; the other slots come from the horse's colours.
const SLOT_FILL: Record<Exclude<SlotTag, null>, string> = {
  B: 'var(--body)', M: 'var(--mane)', T: 'var(--tail)', S: 'var(--saddle)', H: '#1F1108',
};
// Rows 16-17 are thighs, 18+ shins and hooves; x < 14 is the back pair.
const UPPER_LEG_START = 16;
const LOWER_LEG_START = 18;
const LEG_SPLIT_X = 14;

function partition() {
  const parts = { backUpper: [] as Cell[], backLower: [] as Cell[], frontUpper: [] as Cell[], frontLower: [] as Cell[], body: [] as Cell[] };
  GRID.forEach((row, y) => row.forEach((tag, x) => {
    if (tag === null) return;
    const cell = { x, y, fill: SLOT_FILL[tag] };
    const back = x < LEG_SPLIT_X;
    if (y >= LOWER_LEG_START) (back ? parts.backLower : parts.frontLower).push(cell);
    else if (y >= UPPER_LEG_START) (back ? parts.backUpper : parts.frontUpper).push(cell);
    else parts.body.push(cell);
  }));
  return parts;
}
const PARTS = partition();

@Component({
  selector: 'td-horse',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.running]': 'running()',
    '[style.--body]': 'colors().body',
    '[style.--mane]': 'colors().mane',
    '[style.--tail]': 'colors().tail',
    '[style.--saddle]': 'colors().saddle',
  },
  imports: [HatPixels],
  templateUrl: './horse.html',
  styleUrl: './horse.scss',
})
export class Horse {
  readonly colors = input.required<HorseColors>();
  readonly running = input(false, { transform: booleanAttribute });
  readonly dust = input(false, { transform: booleanAttribute });
  readonly hat = input<WornHat | null>(null);
  protected readonly parts = PARTS;
  // Extended past the grid to fit hat overhang: 6 rows above, 3 columns right.
  protected readonly viewBox = `0 -6 ${SPRITE_WIDTH + 3} ${SPRITE_HEIGHT + 6}`;
  protected readonly showDust = computed(() => this.dust() && this.running());
  protected readonly hatDef = computed(() => {
    const worn = this.hat();
    return worn ? hatById(worn.id) ?? null : null;
  });
}
