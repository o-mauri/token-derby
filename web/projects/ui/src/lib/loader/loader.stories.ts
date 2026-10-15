import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Loader } from './loader';

const meta: Meta<Loader> = { title: 'Components/Loader', component: Loader };
export default meta;

/** Hidden for its first 250ms, then two horses trade the lead. Respects reduced motion. */
export const Default: StoryObj<Loader> = {};
