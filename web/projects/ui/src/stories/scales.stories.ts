import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';

const SPACE = [1, 2, 3, 4, 5, 6, 7, 8];
const RADII = ['radius', 'radius-pill', 'radius-round'];
const LINES = ['line-thin', 'line', 'line-ring', 'focus-width'];
const TRACKING = ['tracking-tight', 'tracking', 'tracking-wide'];

@Component({
  selector: 'sb-scales',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Spacing · 2px base</h3>
    @for (n of space; track n) {
      <div class="row"><code>--td-space-{{ n }}</code><span class="bar" [style.width]="'var(--td-space-' + n + ')'"></span><span class="px">{{ n <= 4 ? n * 2 : [12, 16, 24, 32][n - 5] }}px</span></div>
    }
    <h3>Radius</h3>
    <div class="tiles">
      @for (r of radii; track r) { <div class="tile"><span class="shape" [style.border-radius]="'var(--td-' + r + ')'"></span><code>--td-{{ r }}</code></div> }
    </div>
    <h3>Lines</h3>
    <div class="tiles">
      @for (l of lines; track l) { <div class="tile"><span class="shape line" [style.border-width]="'var(--td-' + l + ')'"></span><code>--td-{{ l }}</code></div> }
    </div>
    <h3>Letter spacing</h3>
    @for (t of tracking; track t) { <p [style.letter-spacing]="'var(--td-' + t + ')'"><code>--td-{{ t }}</code> RACE DAYS · LEADERBOARD</p> }
  `,
  styles: `
    :host { display: block; color: var(--td-text); }
    h3 { color: var(--td-text-muted); font-weight: 400; text-transform: uppercase; letter-spacing: var(--td-tracking-wide); font-size: var(--td-text-xs); margin: var(--td-space-7) 0 var(--td-space-4); }
    code { font-size: var(--td-text-xs); color: var(--td-text-muted); }
    .row { display: grid; grid-template-columns: 9rem auto 3rem; align-items: center; gap: var(--td-space-5); margin-bottom: var(--td-space-3); }
    .bar { display: block; height: 14px; background: var(--td-accent); }
    .px { font-size: var(--td-text-xs); color: var(--td-text-muted); }
    .tiles { display: flex; flex-wrap: wrap; gap: var(--td-space-7); }
    .tile { display: grid; justify-items: center; gap: var(--td-space-3); }
    .shape { display: block; width: 56px; height: 56px; background: var(--td-surface-raised); border: var(--td-line) solid var(--td-accent); }
    .line { background: none; border-style: solid; border-color: var(--td-accent); border-radius: var(--td-radius); }
    p { margin: var(--td-space-3) 0; }
  `,
})
class Scales {
  protected readonly space = SPACE;
  protected readonly radii = RADII;
  protected readonly lines = LINES;
  protected readonly tracking = TRACKING;
}

const meta: Meta<Scales> = { title: 'Foundations/Scales', component: Scales, parameters: { layout: 'padded' } };
export default meta;

/** Spacing, radius, line and letter-spacing tokens, rendered from the live values. */
export const AllScales: StoryObj<Scales> = {};
