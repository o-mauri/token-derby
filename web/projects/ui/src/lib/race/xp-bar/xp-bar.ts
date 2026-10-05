import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import { xpBarModel } from './xp-bar.model';

/** A horse's level and XP for the race just run: level pill, XP gained, and one continuous bar
 *  that replays the gain every 10s (and the level ticking over, if it did). */
@Component({
  selector: 'td-xp-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'img',
    '[attr.aria-label]': 'label()',
    '[class.lvup]': 'm().levelledUp',
    '[class.nolv]': '!m().levelledUp',
    '[class.sm]': "size() === 'sm'",
  },
  template: `
    <div class="wrap">
    <div class="line">
      <span class="pill"><span class="before">Lvl. {{ m().levelBefore }}</span>@if (m().levelledUp) {<span class="after">Lvl. {{ m().levelAfter }}</span>}</span>
      <span class="gained">+{{ m().awarded }} XP</span>
      @if (m().levelledUp) { <span class="uptag">LEVEL UP</span> }
    </div>
    <div class="bar"><div class="capsule" [style.--o]="m().oldPct" [style.--n]="m().newPct"><div class="gain"></div></div></div>
    @if (caption()) { <div class="caption">{{ captionText() }}</div> }
    </div>
  `,
  styleUrl: './xp-bar.scss',
})
export class XpBar {
  readonly xpBefore = input.required<number>();
  readonly xpAwarded = input.required<number>();
  readonly caption = input(false, { transform: booleanAttribute });
  readonly size = input<'md' | 'sm'>('md');

  protected readonly m = computed(() => xpBarModel(this.xpBefore(), this.xpAwarded()));
  protected readonly captionText = computed(() => (this.m().maxed ? 'Max level' : `${this.m().into} / ${this.m().forLevel} XP`));
  protected readonly label = computed(() => {
    const m = this.m();
    const level = m.levelledUp ? `Level ${m.levelAfter}, up from level ${m.levelBefore}.` : `Level ${m.levelAfter}.`;
    const progress = m.maxed ? 'at the maximum level' : `${m.into} of ${m.forLevel} XP into the level`;
    return `${level} Gained ${m.awarded} XP; ${progress}.`;
  });
}
