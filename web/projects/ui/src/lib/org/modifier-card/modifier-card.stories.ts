import type { Meta, StoryObj } from '@storybook/angular-vite';
import { MODIFIERS } from '@token-derby/shared';
import { ModifierCard } from './modifier-card';

const meta: Meta<ModifierCard> = {
  title: 'Org/Modifier card',
  component: ModifierCard,
  parameters: { layout: 'padded' },
  args: { modifier: MODIFIERS.stamina, value: undefined },
  render: (args) => ({ props: args, template: `<td-modifier-card [modifier]="modifier" [value]="value" (valueChange)="value = $event" style="max-width:52rem" />` }),
};
export default meta;
type S = StoryObj<ModifierCard>;
export const Off: S = {};
export const On: S = { args: { value: { enabled: true } } };
export const OnTuned: S = { args: { value: { enabled: true, params: { sustainable_pace: 6000 } } } };
