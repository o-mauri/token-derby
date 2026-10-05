import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Horse } from './horse';

const meta: Meta<Horse> = {
  title: 'Components/Horse',
  component: Horse,
  render: (args) => ({ props: args, template: `<div style="height:96px;aspect-ratio:32/24"><td-horse [colors]="colors" [running]="running" [dust]="dust" [hat]="hat" /></div>` }),
  args: { colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' }, running: false, dust: false, hat: null },
};
export default meta;

export const Standing: StoryObj<Horse> = {};
export const Running: StoryObj<Horse> = { args: { running: true, dust: true } };
export const Colourways: StoryObj<Horse> = {
  render: () => ({
    props: {
      ways: [
        { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' },
        { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' },
        { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' },
        { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' },
      ],
    },
    template: `<div style="display:flex;gap:24px">@for (c of ways; track $index) {<div style="height:72px;aspect-ratio:32/24"><td-horse [colors]="c" running /></div>}</div>`,
  }),
};

/** The horse wears an optional hat, drawn in its own sprite so it moves with the head. */
export const WithHat: StoryObj<Horse> = { args: { hat: { id: 'stetson', variant: 0 } } };
export const RunningWithLegendary: StoryObj<Horse> = { args: { running: true, dust: true, hat: { id: 'rainbow_crown' } } };
export const HatParade: StoryObj<Horse> = {
  render: () => ({
    props: {
      field: [
        { c: { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' }, hat: { id: 'viking_helmet' } },
        { c: { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' }, hat: { id: 'plague_doctor' } },
        { c: { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' }, hat: { id: 'samurai_kabuto' } },
        { c: { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' }, hat: { id: 'london_bus' } },
      ],
    },
    template: `<div style="display:flex;gap:24px">@for (h of field; track $index) {<div style="height:80px;aspect-ratio:32/24"><td-horse [colors]="h.c" [hat]="h.hat" running /></div>}</div>`,
  }),
};
