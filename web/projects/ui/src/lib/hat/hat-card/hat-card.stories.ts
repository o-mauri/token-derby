import type { Meta, StoryObj } from '@storybook/angular-vite';
import { HATS, hatColors, isAnimatedHat, variantCount } from '@token-derby/shared';
import { HatCard, relativeLuminance } from './hat-card';

const CHESTNUT = { body: '#A0522D', mane: '#2F1B0C', tail: '#2F1B0C', saddle: '#8B4513' };
const GREY = { body: '#B0B0B5', mane: '#E8E8EC', tail: '#E8E8EC', saddle: '#3F2A18' };

const meta: Meta<HatCard> = {
  title: 'Catalog/Hat card',
  component: HatCard,
  parameters: { layout: 'padded' },
  args: { hat: HATS.find((h) => h.rarity === 'common' && variantCount(h) > 1)!, colors: CHESTNUT },
  render: (args) => ({ props: args, template: `<td-hat-card [hat]="hat" [colors]="colors" style="max-width:24rem" />` }),
};
export default meta;
type S = StoryObj<HatCard>;
export const Common: S = {};
export const CommonGrey: S = { args: { colors: GREY } };
export const Legendary: S = { args: { hat: HATS.find((h) => isAnimatedHat(h))! } };
export const Exclusive: S = { args: { hat: HATS.find((h) => !h.rollable)! } };
export const DarkHat: S = { args: { hat: HATS.find((h) => !isAnimatedHat(h) && relativeLuminance(hatColors(h, 0).A) < 0.18) ?? HATS[0]! } };
