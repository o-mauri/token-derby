import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { ThemePicker } from '../../theme/theme-picker';
import { RaceHeader } from './header';

const anchor = () => ({ atMs: Date.now(), timeLeftSeconds: 5 * 3600 + 59 * 60 + 57 });

const meta: Meta<RaceHeader> = {
  title: 'Race/Header',
  component: RaceHeader,
  decorators: [moduleMetadata({ imports: [ThemePicker] })],
  parameters: { layout: 'fullscreen' },
  args: { name: 'Preview Derby', status: 'live', anchor: anchor(), joinCode: 'PRVRCE', orgName: 'Acme', showGraphs: true },
  argTypes: {
    status: { control: 'inline-radio', options: ['pending', 'live', 'finished', null] },
    home: { action: 'home' }, org: { action: 'org' }, graphs: { action: 'graphs' },
  },
  render: (args) => ({
    props: args,
    template: `<td-race-header [name]="name" [status]="status" [anchor]="anchor" [joinCode]="joinCode" [orgName]="orgName" [showGraphs]="showGraphs"
      (home)="home()" (org)="org()" (graphs)="graphs()"><td-theme-picker compact /></td-race-header>`,
  }),
};
export default meta;

/** Button presses show up in the Actions panel: the header emits, the page navigates. */
export const Live: StoryObj<RaceHeader> = {};
export const Pending: StoryObj<RaceHeader> = { args: { status: 'pending' } };
export const Finished: StoryObj<RaceHeader> = { args: { status: 'finished', anchor: { atMs: Date.now(), timeLeftSeconds: 0 } } };
export const NoOrg: StoryObj<RaceHeader> = { args: { orgName: null } };
/** Unbounded race names scroll sideways instead of resizing the header. */
export const LongName: StoryObj<RaceHeader> = { args: { name: 'The Grand Annual Friday Afternoon Token Derby Championship Invitational' } };
/** Before the first poll: blank title and dashes, so nothing jumps when data lands. */
export const BeforeFirstPoll: StoryObj<RaceHeader> = { args: { name: '', status: null, anchor: null } };

/** The same header in narrower boxes: it drops the join code, then the theme picker, then the status, then the org button. */
export const Shedding: StoryObj<RaceHeader> = {
  render: (args) => ({
    props: { ...args, widths: [1100, 800, 640, 500, 420] },
    template: `<div style="display:grid;gap:var(--td-space-6)">
      @for (w of widths; track w) {
        <div [style.width.px]="w"><code style="font-size:var(--td-text-xs);color:var(--td-text-muted)">{{ w }}px</code>
          <td-race-header [name]="name" [status]="status" [anchor]="anchor" [joinCode]="joinCode" [orgName]="orgName"><td-theme-picker compact /></td-race-header>
        </div>
      }
    </div>`,
  }),
};
