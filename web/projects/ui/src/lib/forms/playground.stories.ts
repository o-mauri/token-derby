import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { FormField, form, max, min, required } from '@angular/forms/signals';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ChipGroup } from './chip-group/chip-group';
import { CopyField } from './copy-field/copy-field';
import { Segmented } from './segmented/segmented';
import { Select } from './select/select';
import { Slider } from './slider/slider';
import { TextInput } from './text-input/text-input';
import { Toggle } from './toggle/toggle';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({ value: i + 1, label }));
const MODES = [{ value: 'schedule', label: 'Schedule' }, { value: 'league', label: 'League' }, { value: 'off', label: 'Off' }];
const LEAGUES = [{ value: 'spring', label: 'Spring cup' }, { value: 'summer', label: 'Summer derby' }];

@Component({
  selector: 'sb-race-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe, FormField, ChipGroup, CopyField, Segmented, Select, Slider, TextInput, Toggle],
  template: `
    <form class="settings" novalidate>
      <td-segmented label="Racing mode" [options]="modes" [formField]="f.mode" />
      <td-chip-group label="Race days" [options]="days" [formField]="f.days" />
      <td-select label="League" [options]="leagues" placeholder="Pick a league" [formField]="f.league" />
      <td-text-input label="Webhook URL" placeholder="https://…" [formField]="f.webhook" />
      <td-toggle label="Stamina" [formField]="f.stamina" />
      <td-slider label="Drain per heartbeat" [step]="0.5" [defaultValue]="5" [format]="pct" [formField]="f.drain" />
      <td-slider label="Recovery rate" [step]="1" [defaultValue]="3" [formField]="f.recovery" />
      <td-copy-field label="Join token" value="tdj_8f3k29xq7m1p" />
      <pre class="model">{{ model() | json }}</pre>
    </form>
  `,
  styles: `
    .settings { display: grid; gap: 22px; width: min(420px, 100%); }
    .model { margin: 0; padding: 10px; font-size: 0.7rem; color: var(--td-text-muted); border: 1px dashed var(--td-border); }
  `,
})
class RaceSettings {
  protected readonly days = DAYS;
  protected readonly modes = MODES;
  protected readonly leagues = LEAGUES;
  protected readonly pct = (n: number) => `${n}%`;
  protected readonly model = signal({ mode: 'schedule', days: [1, 3, 5], league: null as string | null, webhook: '', stamina: true, drain: 4, recovery: 3 });
  protected readonly f = form(this.model, (p) => {
    required(p.league, { message: 'Choose a league' });
    required(p.webhook, { message: 'Webhook URL is required' });
    min(p.drain, 0);
    max(p.drain, 10);
    min(p.recovery, 0);
    max(p.recovery, 10);
  });
}

const meta: Meta<RaceSettings> = { title: 'Forms/Playground', component: RaceSettings, parameters: { layout: 'padded' } };
export default meta;

/** Every control bound to one Signal Forms model, shaped like the org race-settings screen. Blur a required field to see its error. */
export const RaceSettingsForm: StoryObj<RaceSettings> = {};
