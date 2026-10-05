import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';

const SIZES = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl'] as const;

@Component({
  selector: 'sb-typography',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <h3>VT323 · --td-font-pixel (body)</h3>
      @for (s of sizes; track s) {
        <p [style.font-size]="'var(--td-text-' + s + ')'"><span class="size">--td-text-{{ s }}</span> The quick horse jumps the rail — 1,234,567 tokens</p>
      }
    </section>
    <section>
      <h3>Barlow Semi Condensed 600</h3>
      <p class="barlow">STABLE · LEADERBOARD · 12,345 TOKENS</p>
      <h3>Bitcount Prop Single</h3>
      <p class="bitcount">TOKEN DERBY 2026</p>
    </section>
  `,
  styles: `
    :host { display: block; color: var(--td-text); }
    h3 { color: var(--td-text-muted); font-weight: 400; text-transform: uppercase; letter-spacing: var(--td-tracking-wide); font-size: var(--td-text-xs); margin: var(--td-space-6) 0 var(--td-space-2); }
    p { margin: var(--td-space-2) 0; }
    .size { display: inline-block; width: 9em; color: var(--td-text-muted); font-size: var(--td-text-xs); }
    .barlow { font-family: 'Barlow Semi Condensed', var(--td-font-pixel); font-weight: 600; font-size: var(--td-text-lg); }
    .bitcount { font-family: 'Bitcount Prop Single', var(--td-font-pixel); font-size: var(--td-text-xl); }
  `,
})
class Typography {
  protected readonly sizes = SIZES;
}

const meta: Meta<Typography> = { title: 'Foundations/Typography', component: Typography, parameters: { layout: 'padded' } };
export default meta;

/** The type scale, --td-text-2xs to --td-text-xl, and the display faces. */
export const Specimen: StoryObj<Typography> = {};
