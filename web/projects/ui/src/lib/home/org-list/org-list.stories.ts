import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { OrgList } from './org-list';

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Team${String(i + 1).padStart(2, '0')}` }));

const meta: Meta<OrgList> = {
  title: 'Home/Org list',
  component: OrgList,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] })],
  parameters: { layout: 'padded' },
  args: { orgs: [{ name: 'acme' }, { name: 'NightOwls' }, { name: 'Stackone' }] },
  render: (args) => ({ props: args, template: `<td-org-list [orgs]="orgs" style="width:18rem;height:240px" />` }),
};
export default meta;
type S = StoryObj<OrgList>;

export const Default: S = {};
export const LongNames: S = { args: { orgs: [{ name: 'Grandnational' }, { name: 'Wwwwwwwwwwww' }, { name: 'Acme' }] } };
// Twenty orgs in a 240px box: the list scrolls, nothing around it moves.
export const Many: S = { args: { orgs: names(20) } };
