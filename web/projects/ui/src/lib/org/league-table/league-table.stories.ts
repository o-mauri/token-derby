import type { Meta, StoryObj } from '@storybook/angular-vite';
import { runner } from '../fixture';
import type { LeagueDivisionView } from '../models';
import { LeagueTable } from './league-table';

const colours = ['brown', 'white', 'plum', 'tan', 'green'] as const;
const division = (name: string, names: string[]): LeagueDivisionView => ({
  name,
  rows: names.map((n, i) => ({
    ...runner(n, ['dana', 'omar', 'sam', 'kit', 'lee'][i % 5]!, colours[i % 5], 0, i % 3 === 0 ? { id: 'cowboy_hat' } : null),
    place: i + 1, points: 44 - i * 4, zone: i >= names.length - 2 ? ('relegate' as const) : null,
  })),
});

const meta: Meta<LeagueTable> = {
  title: 'Org/League table',
  component: LeagueTable,
  parameters: { layout: 'padded' },
  render: (args) => ({ props: args, template: `<div style="max-width:420px"><td-league-table [division]="division" /></div>` }),
};
export default meta;
type S = StoryObj<LeagueTable>;

export const Division: S = { args: { division: division('Premier', ['Gallopz', 'Neigh Sayer', 'Hay Girl', 'Seabiscuit', 'Trotsky', 'Comet', 'Juniper', 'Rocket']) } };
/** 40-character names scroll; the owner gives way first. */
export const LongNames: S = { args: { division: division('Championship', ['Sir Gallopsalot the Magnificent Steed Jr', 'Neigh Sayer of the Northern Downs III', 'Fern']) } };
export const Empty: S = { args: { division: { name: 'League Two', rows: [] } } };
