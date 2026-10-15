import type { Meta, StoryObj } from '@storybook/angular-vite';
import { HorseFace } from './horse-face';

const meta: Meta<HorseFace> = {
  title: 'Components/Horse face',
  component: HorseFace,
  args: { colors: {} },
  render: (args) => ({ props: args, template: `<td-horse-face [colors]="colors" style="font-size:6rem" />` }),
};
export default meta;

/** The site's logo mark in its own colours. Set body, mane or eye in the controls to recolour it. */
export const Default: StoryObj<HorseFace> = {};

/** Sized by font-size, so it matches the text beside it. */
export const Sizes: StoryObj<HorseFace> = {
  render: () => ({ template: `<div style="display:flex;gap:var(--td-space-6);align-items:end"><td-horse-face style="font-size:1rem" /><td-horse-face style="font-size:2rem" /><td-horse-face style="font-size:4rem" /></div>` }),
};

/** A horse's own colours passed straight in: each face matches the horse it belongs to. */
export const Colourways: StoryObj<HorseFace> = {
  render: () => ({
    props: {
      horses: [
        { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' },
        { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' },
        { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' },
        { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' },
        { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207', eye: '#FFFFFF' },
      ],
    },
    template: `<div style="display:flex;gap:var(--td-space-7)">@for (c of horses; track $index) { <td-horse-face [colors]="c" style="font-size:4rem" /> }</div>`,
  }),
};
