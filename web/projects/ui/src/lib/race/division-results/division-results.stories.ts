import type { Meta, StoryObj } from '@storybook/angular-vite';
import { divisionResults } from '../logic/league';
import { LEAGUE_NAMES, leagueRunners } from '../logic/league-fixture';
import { DivisionResults } from './division-results';

const meta: Meta<DivisionResults> = {
  title: 'Race/Finished/Division results',
  component: DivisionResults,
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** The Divisions tab: each division's finish, with the league points it earned. */
export const TwoDivisions: StoryObj<DivisionResults> = { args: { results: divisionResults(leagueRunners(2), LEAGUE_NAMES) } };
/** More than three: arrows step through them. On a phone they stack. */
export const FiveDivisions: StoryObj<DivisionResults> = { args: { results: divisionResults(leagueRunners(5), LEAGUE_NAMES) } };
