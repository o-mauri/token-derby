import type { Meta, StoryObj } from '@storybook/angular-vite';
import { PendingBanner } from './pending-banner';

const meta: Meta<PendingBanner> = {
  title: 'Race/Pending banner',
  component: PendingBanner,
  parameters: { layout: 'fullscreen' },
  args: { startsAt: new Date(Date.now() + (12 * 60 + 34) * 1000).toISOString() },
};
export default meta;

/** Counts down to the off on the LED clock. */
export const StartsSoon: StoryObj<PendingBanner> = {};
/** About to go: flips to "Starting…" when the clock runs out. */
export const AboutToStart: StoryObj<PendingBanner> = { args: { startsAt: new Date(Date.now() + 5000).toISOString() } };
export const Starting: StoryObj<PendingBanner> = { args: { startsAt: new Date(Date.now() - 1000).toISOString() } };
