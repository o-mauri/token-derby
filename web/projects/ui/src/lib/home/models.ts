import type { HorseColors } from '@token-derby/shared';

export type OrgLink = { readonly name: string };

/** The grey horse shown when we don't know a horse's colours. */
export const NEUTRAL_HORSE: HorseColors = { body: '#8a8a94', mane: '#55555e', tail: '#55555e', saddle: '#6b6b75' };
