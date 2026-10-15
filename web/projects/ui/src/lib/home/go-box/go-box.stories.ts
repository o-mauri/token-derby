import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { GoBox } from './go-box';

const meta: Meta<GoBox> = {
  title: 'Home/Go box',
  component: GoBox,
  parameters: { layout: 'padded' },
  args: { label: 'Organisation name', placeholder: 'myteam', pattern: /^[A-Za-z0-9]{1,12}$/, maxLength: 12, invalidText: 'Org names are 1–12 letters or digits.', action: 'Go', upper: false },
};
export default meta;
type S = StoryObj<GoBox>;

export const OrgName: S = {};
export const RaceCode: S = {
  args: { label: 'Race code', placeholder: 'ABC123', pattern: /^[A-Za-z0-9]{6}$/, maxLength: 6, invalidText: 'Race codes are exactly 6 letters or digits.', action: 'Watch', upper: true },
};
export const WithError: S = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText('Organisation name'), 'bad!');
    await userEvent.click(c.getByRole('button', { name: 'Go' }));
    await expect(c.getByRole('alert')).toHaveTextContent('Org names are 1–12 letters or digits.');
  },
};
