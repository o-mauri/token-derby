import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Slider } from './slider';

const meta: Meta<Slider> = {
  title: 'Forms/Slider',
  component: Slider,
  args: { label: 'Drain per heartbeat', min: 0, max: 10, step: 0.5, value: 4, defaultValue: 5, disabled: false, format: (n: number) => `${n}%` },
  argTypes: { valueChange: { action: 'valueChange' } },
  decorators: [(story) => ({ ...story(), template: `<div style="width:360px"><td-slider [label]="label" [min]="min" [max]="max" [step]="step" [value]="value" [defaultValue]="defaultValue" [format]="format" [disabled]="disabled" (valueChange)="valueChange($event)" /></div>` })],
};
export default meta;

/** Stamina-style parameter with its default marked on the track. */
export const WithDefault: StoryObj<Slider> = {};
export const NoDefault: StoryObj<Slider> = { args: { label: 'Recovery rate', defaultValue: undefined, value: 7 } };
export const Disabled: StoryObj<Slider> = { args: { disabled: true } };
