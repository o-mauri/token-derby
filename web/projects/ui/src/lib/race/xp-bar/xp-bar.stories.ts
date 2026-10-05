import type { Meta, StoryObj } from '@storybook/angular-vite';
import { XpBar } from './xp-bar';

const meta: Meta<XpBar> = {
  title: 'Race/XP bar',
  component: XpBar,
  args: { xpBefore: 60, xpAwarded: 80, caption: true, size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['md', 'sm'] } },
  render: (args) => ({ props: args, template: `<div style="width:260px"><td-xp-bar [xpBefore]="xpBefore" [xpAwarded]="xpAwarded" [caption]="caption" [size]="size" /></div>` }),
};
export default meta;

/** Replays every 10s: old XP, the gain grows in a lighter blue, flashes twice, then merges into one colour. */
export const SameLevel: StoryObj<XpBar> = {};
/** Fills to the end, the level pill ticks over with a flash, then the bar refills to the new XP. */
export const LevelUp: StoryObj<XpBar> = { args: { xpBefore: 140, xpAwarded: 40 } };
export const MaxLevel: StoryObj<XpBar> = { args: { xpBefore: 99_000, xpAwarded: 120 } };
/** The thin version used on board rows. */
export const Compact: StoryObj<XpBar> = { args: { size: 'sm', caption: false, xpBefore: 140, xpAwarded: 40 } };
