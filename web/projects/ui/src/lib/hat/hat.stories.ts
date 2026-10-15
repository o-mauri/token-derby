import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { HATS, isAnimatedHat, variantCount } from '@token-derby/shared';
import { Hat } from './hat';

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'limited'] as const;

const meta: Meta<Hat> = {
  title: 'Race/Hat',
  component: Hat,
  args: { id: 'stetson', variant: 0 },
  argTypes: { id: { control: 'select', options: HATS.map((h) => h.id) } },
  render: (args) => ({ props: args, template: `<td-hat [id]="id" [variant]="variant" style="width:96px;height:96px" />` }),
};
export default meta;

export const Single: StoryObj<Hat> = {};

/** A hat's colour variants side by side. */
export const Variants: StoryObj<Hat> = {
  args: { id: 'bucket_hat' },
  render: (args) => ({
    props: { ...args, variants: Array.from({ length: variantCount(HATS.find((h) => h.id === args.id)!) }, (_, i) => i) },
    template: `<div style="display:flex;gap:24px">@for (v of variants; track v) { <td-hat [id]="id" [variant]="v" style="width:72px;height:72px" /> }</div>`,
  }),
};

/** Legendaries cycle their colours; under reduced motion they hold still. */
export const Legendary: StoryObj<Hat> = { args: { id: HATS.find(isAnimatedHat)!.id } };

/** Every hat in the catalogue, grouped by rarity. */
export const Catalogue: StoryObj = {
  decorators: [moduleMetadata({ imports: [Hat] })],
  parameters: { layout: 'padded' },
  render: () => ({
    props: { groups: RARITIES.map((r) => ({ rarity: r, hats: HATS.filter((h) => h.rarity === r) })) },
    template: `
      @for (g of groups; track g.rarity) {
        <h3 [style.color]="'var(--td-rarity-' + g.rarity + ')'" style="font-weight:400;text-transform:uppercase;letter-spacing:var(--td-tracking-wide);font-size:var(--td-text-xs);margin:var(--td-space-6) 0 var(--td-space-4)">{{ g.rarity }} · {{ g.hats.length }}</h3>
        <div style="display:flex;flex-wrap:wrap;gap:var(--td-space-6)">
          @for (h of g.hats; track h.id) {
            <figure style="margin:0;display:grid;justify-items:center;gap:var(--td-space-2);width:84px">
              <td-hat [id]="h.id" style="width:56px;height:56px" />
              <figcaption style="font-size:var(--td-text-xs);color:var(--td-text-muted);text-align:center">{{ h.name }}</figcaption>
            </figure>
          }
        </div>
      }`,
  }),
};
