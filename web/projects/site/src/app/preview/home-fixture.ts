import { DOCUMENT, inject } from '@angular/core';
import type { ListOrganisationsResponse } from '@token-derby/shared';
import { MemoryStorage } from '../session/memory-storage';
import { SESSION_KEYS } from '../session/session-storage';

export type HomePreviewState = 'out' | 'in' | 'empty' | 'many' | 'failed';

export function homePreviewState(): HomePreviewState {
  const signed = new URLSearchParams(inject(DOCUMENT).defaultView?.location.search ?? '').get('signed');
  return signed === 'in' || signed === 'empty' || signed === 'many' || signed === 'failed' ? signed : 'out';
}

/** A session store seeded from ?signed: empty when signed out, otherwise a fake signed-in user. */
export function previewSessionStorage(): Storage {
  if (homePreviewState() === 'out') return new MemoryStorage();
  return new MemoryStorage({ [SESSION_KEYS.token]: 'preview', [SESSION_KEYS.uid]: 'u1', [SESSION_KEYS.name]: 'Omar' });
}

const MANY = ['Acme', 'Bluebell', 'Canter', 'Dappled', 'Eclipse', 'Furlong', 'Gallop', 'Hackney', 'Inkwell', 'Jumpers',
  'Kestrel', 'Longshot', 'Mustang', 'NightOwls', 'Outsider', 'Paddock', 'Quarter', 'Racers', 'Stackone', 'Trotters'];

export function previewMyOrgs(state: HomePreviewState): ListOrganisationsResponse {
  // Mixed case on purpose: the page sorts them case-insensitively.
  const names = state === 'many' ? MANY : state === 'empty' ? [] : ['Stackone', 'acme', 'NightOwls'];
  return { organisations: names.map((org_name, i) => ({ org_id: `o${i}`, org_name })) };
}
