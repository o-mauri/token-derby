import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HorseFace } from '../../horse-face/horse-face';
import { Marquee } from '../../horse-chip/marquee';
import { medalOf, ordinal } from '../../horse-chip/ordinal';
import { GapTrack, type GapMark } from '../gap-track/gap-track';
import { chaseMarks, signedTokens } from '../logic/chase';
import type { LaneView } from '../models';

const tokenFmt = new Intl.NumberFormat('en-US');
// Each mark, number and tick takes one colour: gold for the hovered horse, orange ahead of it, green behind.
const SIDE_TONE = { you: 'var(--td-coin)', ahead: 'var(--td-stamina-mid)', behind: 'var(--td-stamina-high)' } as const;
const medalTone = (medal: string) => (medal === 'place' ? 'var(--td-text)' : `var(--td-medal-${medal})`);
const STAMINA_BLOCKS = 10;

/** The large stats card shown when a horse on the track is hovered or tapped: everything its name tag cycles through,
 *  plus a gap track to its nearest rivals. */
@Component({
  selector: 'td-horse-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GapTrack, HorseFace, Marquee],
  templateUrl: './horse-card.html',
  styleUrl: './horse-card.scss',
})
export class HorseCard {
  readonly lane = input.required<LaneView>();
  // The whole field, for the gaps to the horses around this one.
  readonly field = input.required<readonly LaneView[]>();

  protected readonly face = computed(() => ({ body: this.lane().colors.body, mane: this.lane().colors.mane }));
  protected readonly place = computed(() => {
    const [, num, suffix] = /^(\d+)(\D+)$/.exec(ordinal(this.lane().position))!;
    const medal = medalOf(this.lane().position);
    return { num, suffix: suffix!.toUpperCase(), medal, tone: medal === 'place' ? null : medalTone(medal) };
  });
  protected readonly tokensText = computed(() => tokenFmt.format(this.lane().tokens));
  protected readonly paceText = computed(() => {
    const pace = this.lane().pace;
    return pace === null ? null : `▲ ${tokenFmt.format(pace)}/min`;
  });

  protected readonly marks = computed((): GapMark[] => chaseMarks(this.field(), this.lane().id).map((m) => {
    const place = ordinal(m.position).toUpperCase();
    const side = m.you ? 'you' : m.delta < 0 ? 'ahead' : 'behind';
    return {
      id: m.id, name: m.name, at: m.at, you: m.you, side,
      tone: SIDE_TONE[side], markTone: m.you ? SIDE_TONE.you : medalTone(medalOf(m.position)),
      label: m.you ? 'YOU' : side === 'ahead' ? `TO ${place}` : place,
      value: m.you ? place : signedTokens(m.delta),
    };
  }));

  protected readonly stamina = computed(() => {
    const s = this.lane().stamina;
    if (!s) return null;
    const on = Math.round((s.value / 100) * STAMINA_BLOCKS);
    return { band: s.band, tone: `var(--td-stamina-${s.band})`, pct: `${Math.round(s.value)}%`, blocks: Array.from({ length: STAMINA_BLOCKS }, (_, i) => i < on) };
  });

  protected readonly leagueText = computed(() => {
    const league = this.lane().league;
    return league ? `${ordinal(league.rank)} in ${league.division}` : null;
  });
}
