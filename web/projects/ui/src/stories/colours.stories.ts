import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import tokens from '../../styles/tokens.json';
import { THEMES } from '../lib/theme/themes';

type ThemeTokens = Record<string, Record<string, string>>;
const ALL = tokens as ThemeTokens;
const COLOUR_TOKENS = Object.keys(ALL['derby']).filter((k) => /^#|^rgba?\(/.test(ALL['derby'][k]));
// Phosphor and Matrix share one token file.
const fileFor = (id: string) => (id === 'phosphor' || id === 'matrix' ? 'phosphor-matrix' : id);
const valueOf = (theme: string, token: string) => ALL[fileFor(theme)]?.[token] ?? ALL['derby'][token];

@Component({
  selector: 'sb-colour-swatches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table>
      <thead><tr><th>Token</th>@for (t of themes; track t.id) {<th>{{ t.label }}</th>}</tr></thead>
      <tbody>
        @for (token of tokens; track token) {
          <tr>
            <td class="name">{{ token }}</td>
            @for (t of themes; track t.id) {
              <td><span class="chip" [style.background]="value(t.id, token)"></span><code>{{ value(t.id, token) }}</code></td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    table { border-collapse: collapse; font-size: 0.7rem; color: var(--td-text); }
    th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--td-border); vertical-align: middle; }
    th { color: var(--td-text-muted); font-weight: 400; text-transform: uppercase; letter-spacing: 0.1em; }
    .name { color: var(--td-accent); white-space: nowrap; }
    .chip { display: inline-block; width: 28px; height: 18px; margin-right: 6px; vertical-align: middle; border: 1px solid var(--td-border); }
    code { font-family: ui-monospace, monospace; font-size: 0.6rem; color: var(--td-text-muted); }
  `,
})
class ColourSwatches {
  protected readonly themes = THEMES;
  protected readonly tokens = COLOUR_TOKENS;
  protected value = valueOf;
}

const meta: Meta<ColourSwatches> = {
  title: 'Foundations/Colours',
  component: ColourSwatches,
  parameters: { layout: 'padded' },
};
export default meta;

/** Every colour token across all eight themes, from the extracted token files. */
export const AllThemes: StoryObj<ColourSwatches> = {};
