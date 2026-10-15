import type { Meta, StoryObj } from '@storybook/angular-vite';
import { finishedField } from '../finished/fixture';
import { Podium } from './podium';

const meta: Meta<Podium> = { title: 'Race/Finished/Podium', component: Podium, parameters: { layout: 'fullscreen' }, args: { top: finishedField(3) } };
export default meta;

/** The winner large in the middle under a spotlight, 2nd and 3rd either side, each with the animated XP bar. */
export const TopThree: StoryObj<Podium> = {};
/** On a phone the winner stacks first and 2nd and 3rd sit side by side. */
export const Phone: StoryObj<Podium> = { render: (args) => ({ props: args, template: `<div style="width:380px"><td-podium [top]="top" /></div>` }) };
