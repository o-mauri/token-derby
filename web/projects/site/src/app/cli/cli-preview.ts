import { InjectionToken } from '@angular/core';

export type CliStart = { readonly step: 'confirm' | 'done'; readonly code: string; readonly label: string };

/** Where /cli opens. Only the preview route provides it; the real page always starts at code entry. */
export const CLI_PREVIEW_START = new InjectionToken<CliStart | null>('CLI_PREVIEW_START', { factory: () => null });
