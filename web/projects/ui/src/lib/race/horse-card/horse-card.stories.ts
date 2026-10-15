import type { Meta, StoryObj } from '@storybook/angular-vite';
import type { LaneView } from '../models';
import { HorseCard } from './horse-card';

type Args = { id: string; field: LaneView[] };

const lane = (id: string, name: string, position: number, tokens: number, colors: LaneView['colors'], extra: Partial<LaneView> = {}): LaneView => ({
  id, name, owner: 'sam', colors, hat: null, tokens, level: 12, pace: 1840, position, league: null,
  stamina: { value: 82, band: 'high' }, ...extra,
});

const FIELD: LaneView[] = [
  lane('a', 'Neigh Sayer', 1, 513_383, { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' }, { owner: 'omar' }),
  lane('b', 'Sir Prompts-a-Lot', 2, 474_922, { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' }, { owner: 'jo' }),
  lane('c', 'Bytewind', 3, 437_267, { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' }),
  lane('d', 'Token Ring', 4, 411_166, { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' }, { owner: 'ana' }),
  lane('e', 'Slow Lorris', 5, 373_803, { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' }, { owner: 'kit', stamina: { value: 31, band: 'mid' } }),
];

const meta: Meta<Args> = {
  title: 'Race/Horse card',
  args: { id: 'c', field: FIELD },
  render: (args) => ({
    props: { ...args, lane: args.field.find((l) => l.id === args.id) },
    moduleMetadata: { imports: [HorseCard] },
    template: `<div style="padding:24px"><td-horse-card [lane]="lane" [field]="field" /></div>`,
  }),
};
export default meta;

/** 3rd and below: the horse directly ahead and the leader. */
export const Third: StoryObj<Args> = {};
/** The leader sees its lead over the two horses behind. */
export const Leader: StoryObj<Args> = { args: { id: 'a' } };
/** 2nd sees the horse behind and the leader. */
export const Second: StoryObj<Args> = { args: { id: 'b' } };
/** A runaway leader: the close rival keeps its minimum distance instead of sitting on top of the hovered horse. */
export const RunawayLeader: StoryObj<Args> = {
  args: {
    id: 'c',
    field: [
      lane('a', 'Neigh Sayer', 1, 1_676_000, FIELD[0]!.colors),
      lane('b', 'Token Ring', 2, 376_810, FIELD[3]!.colors),
      { ...FIELD[4]!, id: 'c', position: 3, stamina: { value: 12, band: 'low' } },
    ],
  },
};
/** Long names scroll in the header and cut off under the gap track. */
export const LongNames: StoryObj<Args> = {
  args: {
    id: 'c',
    field: FIELD.map((l) => ({ ...l, name: `${l.name} the Magnificent Third`, owner: l.id === 'c' ? 'samantha.longsurname' : l.owner })),
  },
};
/** League fixtures add the division standing. */
export const League: StoryObj<Args> = {
  args: { field: FIELD.map((l) => (l.id === 'c' ? { ...l, league: { rank: 2, division: 'Division 1' } } : l)) },
};
/** Stamina off, no pace yet, no owner on record. */
export const Bare: StoryObj<Args> = {
  args: { field: FIELD.map((l) => (l.id === 'c' ? { ...l, stamina: null, pace: null, owner: '' } : l)) },
};
/** Racing alone: no gap track. */
export const Solo: StoryObj<Args> = { args: { id: 'c', field: [FIELD[2]!] } };
