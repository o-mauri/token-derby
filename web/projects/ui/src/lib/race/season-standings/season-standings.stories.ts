import type { Meta, StoryObj } from '@storybook/angular-vite';
import { divisionResults, seasonView } from '../logic/league';
import { LEAGUE_NAMES, leagueRunners, leagueStandings } from '../logic/league-fixture';
import { SeasonStandingsTable } from './season-standings';

const view = (divisions: number, round: number) =>
  seasonView(leagueStandings(divisions, round), divisionResults(leagueRunners(divisions), LEAGUE_NAMES), round);

const meta: Meta<SeasonStandingsTable> = {
  title: 'Race/Finished/Season standings',
  component: SeasonStandingsTable,
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** The Season tab after round 3: points, this race's gain, movement, and the promotion and relegation places. */
export const MidSeason: StoryObj<SeasonStandingsTable> = { args: { view: view(2, 3) } };
/** The last round of the season adds the champion line. */
export const SeasonFinale: StoryObj<SeasonStandingsTable> = { args: { view: view(2, 8) } };
export const FiveDivisions: StoryObj<SeasonStandingsTable> = { args: { view: view(5, 3) } };
