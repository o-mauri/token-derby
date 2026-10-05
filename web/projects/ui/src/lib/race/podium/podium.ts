import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Horse } from '../../horse/horse';
import { XpBar } from '../xp-bar/xp-bar';
import type { FinishView } from '../models';

const MEDALS: Record<number, string> = { 1: 'gold', 2: 'silver', 3: 'bronze' };
// Podium order, left to right: 2nd, the winner, 3rd.
const STAND = [2, 1, 3];

/** The top three under a spotlight: the winner large in the middle, 2nd and 3rd either side. */
@Component({
  selector: 'td-podium',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, XpBar],
  templateUrl: './podium.html',
  styleUrl: './podium.scss',
})
export class Podium {
  readonly top = input.required<readonly FinishView[]>();

  protected readonly places = computed(() =>
    STAND.map((pos) => this.top().find((h) => h.position === pos)).filter((h): h is FinishView => !!h),
  );
  protected readonly medal = (h: FinishView) => MEDALS[h.position] ?? '';
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
}
