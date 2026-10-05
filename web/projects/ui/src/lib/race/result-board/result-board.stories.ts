import type { Meta, StoryObj } from '@storybook/angular-vite';
import { finishedField } from '../finished/fixture';
import { ResultBoard } from './result-board';

const meta: Meta<ResultBoard> = { title: 'Race/Finished/Result board', component: ResultBoard, parameters: { layout: 'fullscreen' }, args: { rows: finishedField(11).slice(3) } };
export default meta;

export const Page: StoryObj<ResultBoard> = {};
/** Phones drop the "behind" column and tuck the XP bar under the name. */
export const Phone: StoryObj<ResultBoard> = { render: (args) => ({ props: args, template: `<div style="width:380px"><td-result-board [rows]="rows" /></div>` }) };
