import type { Meta, StoryObj } from '@storybook/angular-vite';
import { DivisionLadder } from './division-ladder';

const div = (name: string, cap = 8) => ({ name, cap });
const meta: Meta<DivisionLadder> = {
  title: 'Org/Division ladder',
  component: DivisionLadder,
  parameters: { layout: 'padded' },
  args: { value: { divisions: [div('Premier'), div('Championship'), div('League One')], boundaries: [2, 2] }, error: null },
  render: (args) => ({ props: args, template: `<td-division-ladder [(value)]="value" [error]="error" style="max-width:30rem" />` }),
};
export default meta;
type S = StoryObj<DivisionLadder>;
export const Three: S = {};
export const One: S = { args: { value: { divisions: [div('Everyone')], boundaries: [] } } };
export const Six: S = { args: { value: { divisions: ['Premier', 'Championship', 'League One', 'League Two', 'National', 'Sunday'].map((n) => div(n, 6)), boundaries: [2, 2, 2, 2, 2] } } };
export const WithError: S = { args: { error: 'Each swap must be no larger than the cap of the division above it.' } };
