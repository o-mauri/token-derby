import type { Meta, StoryObj } from '@storybook/angular-vite';
import { HorseHead } from './horse-head';

const HORSES = [
  { name: 'Gallopz', colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' }, hat: { id: 'cowboy_hat' } },
  { name: 'Hay Girl', colors: { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' }, hat: { id: 'party_hat' } },
  { name: 'Neigh Sayer', colors: { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' }, hat: null },
  { name: 'Seabiscuit', colors: { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' }, hat: { id: 'sailor_hat' } },
  { name: 'Trotsky', colors: { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' }, hat: null },
];

const meta: Meta<HorseHead> = {
  title: 'Components/Horse head',
  component: HorseHead,
  parameters: { layout: 'padded', docs: { description: { component: 'A head and hat in a disc for dense lists. Dark horses get a light disc and light horses a dark one; the ring keeps it visible on any theme.' } } },
};
export default meta;

export const Single: StoryObj<HorseHead> = { args: { colors: HORSES[0]!.colors, hat: HORSES[0]!.hat, size: '3rem' } };

/** Each sample horse, with and without its hat. Switch themes in the toolbar to check the ring. */
export const Field: StoryObj = {
  render: () => ({
    props: { horses: HORSES },
    template: `
      <div style="display:grid;gap:var(--td-space-4)">
        @for (h of horses; track h.name) {
          <div style="display:flex;gap:var(--td-space-5);align-items:center">
            <td-horse-head [colors]="h.colors" [hat]="h.hat" /> <td-horse-head [colors]="h.colors" size="3rem" [hat]="h.hat" />
            <td-horse-head [colors]="h.colors" size="3rem" /> <span>{{ h.name }}</span>
          </div>
        }
      </div>`,
  }),
};
