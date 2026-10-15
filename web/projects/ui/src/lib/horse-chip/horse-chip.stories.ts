import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { HorseChip } from './horse-chip';

// The lane's name-tag column is 168px wide at TV size, less the tag's 4px/6px insets.
const frame = (inner: string) => `<div style="width:158px">${inner}</div>`;

const meta: Meta<HorseChip> = {
  title: 'Race/Horse chip',
  component: HorseChip,
  args: { name: 'Thunderhoof', owner: 'omar', tokens: 1234567, level: 7, pace: 4321, position: 1, league: null },
  render: (args) => ({
    props: args,
    template: frame(`<td-horse-chip [name]="name" [owner]="owner" [tokens]="tokens" [level]="level" [pace]="pace" [position]="position" [league]="league" />`),
  }),
};
export default meta;

/** The stats row cycles owner → level → pace → position every 3s. */
export const Leader: StoryObj<HorseChip> = {};
export const Second: StoryObj<HorseChip> = { args: { name: 'Bytewind', owner: 'sam', tokens: 987654, position: 2, level: 4 } };
export const Third: StoryObj<HorseChip> = { args: { name: 'Gallop GPT', owner: 'ana', tokens: 512000, position: 3, level: 12 } };
export const MidPack: StoryObj<HorseChip> = { args: { name: 'Slow Lorris', owner: 'kit', tokens: 20480, position: 7, level: 1 } };
/** Names longer than the tag scroll sideways and back. */
export const LongName: StoryObj<HorseChip> = { args: { name: 'Sir Prompts-a-Lot the Magnificent' } };
export const NoPaceYet: StoryObj<HorseChip> = { args: { pace: null, tokens: 0, position: 4 } };
/** League lanes add a fifth view: the place within the horse's division. */
export const League: StoryObj<HorseChip> = { args: { league: { rank: 2, division: 'Gold' } } };
export const LegacyNoOwner: StoryObj<HorseChip> = { args: { owner: '' } };

const FIELD = [
  { name: 'Thunderhoof', owner: 'omar', tokens: 1234567, level: 7, pace: 4321, position: 1 },
  { name: 'Bytewind', owner: 'sam', tokens: 987654, level: 4, pace: 3100, position: 2 },
  { name: 'Gallop GPT', owner: 'ana', tokens: 512000, level: 12, pace: 2205, position: 3 },
  { name: 'Sir Prompts-a-Lot the Magnificent', owner: 'jo', tokens: 410332, level: 9, pace: 1980, position: 4 },
  { name: 'Slow Lorris', owner: 'kit', tokens: 20480, level: 1, pace: null, position: 5 },
];

/** Five chips stacked the way the lanes show them. */
export const Lanes: StoryObj = {
  decorators: [moduleMetadata({ imports: [HorseChip] })],
  render: () => ({
    props: { field: FIELD },
    template: `<div style="display:grid;gap:10px;width:158px">
      @for (h of field; track h.name) {
        <td-horse-chip [name]="h.name" [owner]="h.owner" [tokens]="h.tokens" [level]="h.level" [pace]="h.pace" [position]="h.position" />
      }
    </div>`,
  }),
};
