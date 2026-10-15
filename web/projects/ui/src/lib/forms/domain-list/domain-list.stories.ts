import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DomainList } from './domain-list';

const meta: Meta<DomainList> = {
  title: 'Forms/Domain list',
  component: DomainList,
  parameters: { layout: 'padded' },
  args: { label: 'Allowed domains', value: [] },
  render: (args) => ({ props: args, template: `<td-domain-list [label]="label" [(value)]="value" style="max-width:28rem" />` }),
};
export default meta;
type S = StoryObj<DomainList>;
export const Empty: S = {};
export const Several: S = { args: { value: ['stackone.com', 'stackone.co.uk', 'acme.io'] } };
export const WithError: S = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText('Allowed domains'), 'bad{Enter}');
    await expect(c.getByRole('alert')).toHaveTextContent('Enter a domain like example.com');
  },
};
