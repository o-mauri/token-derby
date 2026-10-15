import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Marquee } from './marquee';
import { medalOf, ordinal } from './ordinal';

export type HorseChipLeague = { rank: number; division: string };

const tokenFmt = new Intl.NumberFormat('en-US');

/** A race lane's name tag: name, token total, and a row cycling owner / level / pace / position. */
@Component({
  selector: 'td-horse-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Marquee],
  templateUrl: './horse-chip.html',
  styleUrl: './horse-chip.scss',
})
export class HorseChip {
  readonly name = input.required<string>();
  readonly owner = input('');
  readonly tokens = input.required<number>();
  readonly level = input.required<number>();
  readonly pace = input<number | null>(null);
  readonly position = input.required<number>();
  readonly league = input<HorseChipLeague | null>(null);

  protected readonly tokensText = computed(() => `${tokenFmt.format(this.tokens())} tok`);
  protected readonly levelText = computed(() => `Lvl. ${this.level()}`);
  protected readonly paceText = computed(() => {
    const pace = this.pace();
    return pace === null ? '—' : `+${tokenFmt.format(pace)}/min`;
  });
  protected readonly positionText = computed(() => ordinal(this.position()));
  protected readonly medal = computed(() => medalOf(this.position()));
  protected readonly leagueText = computed(() => {
    const league = this.league();
    return league ? `${ordinal(league.rank)} (${league.division})` : '';
  });
}
