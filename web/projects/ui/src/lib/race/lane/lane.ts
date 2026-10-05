import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import { Horse } from '../../horse/horse';
import { HorseChip } from '../../horse-chip/horse-chip';
import { StaminaBar } from '../stamina-bar/stamina-bar';
import type { LaneState, LaneView } from '../models';

/** One race lane: the name-tag column plus the running strip with the horse at its progress. */
@Component({
  selector: 'td-race-lane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, HorseChip, StaminaBar],
  templateUrl: './lane.html',
  styleUrl: './lane.scss',
})
export class RaceLane {
  readonly lane = input.required<LaneView>();
  readonly progress = input.required<number>();
  readonly state = input.required<LaneState>();
  // Position in the field, for theme art that differs by lane (Matrix rain offsets, London kerbs).
  readonly index = input(0);
  readonly last = input(false, { transform: booleanAttribute });

  protected readonly running = computed(() => this.state() !== 'finished');
  protected readonly rainClass = computed(() => `rain rain-v${this.index() % 5}`);
}
