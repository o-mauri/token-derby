import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { HorseColors } from '@token-derby/shared';
import { HorseHead } from '../../horse-head/horse-head';
import type { WornHat } from '../../hat/hat-pixels';
import { NEUTRAL_HORSE } from '../models';

/** Your own card on the home page, leading to your personal page; greyed with "Coming soon" when there's no link yet. */
@Component({
  selector: 'td-you-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet, HorseHead],
  template: `
    @if (link(); as to) {
      <a class="card" [routerLink]="to"><ng-container [ngTemplateOutlet]="inner" /><span class="go" aria-hidden="true">›</span></a>
    } @else {
      <div class="card disabled" aria-disabled="true"><ng-container [ngTemplateOutlet]="inner" /><span class="soon">Coming soon</span></div>
    }
    <ng-template #inner>
      <td-horse-head [colors]="shownColors()" [hat]="hat()" size="2.2rem" />
      <span class="name">{{ name() }}</span>
    </ng-template>
  `,
  styleUrl: './you-card.scss',
})
export class YouCard {
  readonly name = input.required<string>();
  readonly link = input<readonly unknown[] | null>(null);
  readonly colors = input<HorseColors | null>(null);
  readonly hat = input<WornHat | null>(null);

  protected readonly shownColors = computed(() => this.colors() ?? NEUTRAL_HORSE);
}
