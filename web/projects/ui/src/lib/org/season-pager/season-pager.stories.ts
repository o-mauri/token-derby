import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { SeasonPager } from './season-pager';

const meta: Meta<SeasonPager> = {
  title: 'Org/Season pager',
  component: SeasonPager,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] })],
  parameters: { layout: 'padded' },
};
export default meta;
type S = StoryObj<SeasonPager>;

export const CurrentSeason: S = { args: { label: 'SEASON 3', progress: { round: 6, total: 10 }, prev: { key: 2, label: 'Season 2' }, next: null } };
/** A finished season: final, with its champion. */
export const PastSeason: S = { args: { label: 'SEASON 2', champion: { name: 'Gallopz', owner: 'dana', division: 'Premier' }, prev: { key: 1, label: 'Season 1' }, next: { key: 3, label: 'Season 3' } } };
export const FirstSeason: S = { args: { label: 'SEASON 1', champion: { name: 'Hay Girl', owner: 'sam', division: 'Premier' }, prev: null, next: { key: 2, label: 'Season 2' } } };
