import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { ColumnTemplate, ColumnWindow } from './column-window';

type Args = { count: number; max: number };
const NAMES = ['Premier', 'Championship', 'League One', 'League Two', 'National', 'Regional'];

const meta: Meta<Args> = {
  title: 'Layout/Column window',
  component: ColumnWindow,
  decorators: [moduleMetadata({ imports: [ColumnTemplate] })],
  parameters: { layout: 'padded' },
  args: { count: 5, max: 3 },
  render: (args) => ({
    props: { ...args, names: NAMES.slice(0, args.count) },
    template: `
      <td-column-window [max]="max" label="divisions">
        @for (n of names; track n) {
          <ng-template tdColumn [header]="n">
            <div style="border:var(--td-line) solid var(--td-border);padding:var(--td-space-5);min-height:120px">{{ n }}</div>
          </ng-template>
        }
      </td-column-window>`,
  }),
};
export default meta;

/** Up to three side by side, top division on the left; arrows step one at a time and stop at each end. On a phone every column stacks. */
export const FiveColumns: StoryObj<Args> = {};
export const FitsWithoutArrows: StoryObj<Args> = { args: { count: 2 } };
