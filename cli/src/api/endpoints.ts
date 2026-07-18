import { createEndpoints } from '@token-derby/client';
import { request } from './client.js';

const api = createEndpoints({ request });

export const {
  createRace,
  getRace,
  joinRace,
  heartbeat,
  endRace,
  joinOrganisation,
  listOrganisations,
  initJockey,
  getJockey,
  updateJockey,
  listStable,
  createStableHorse,
  updateStableHorse,
  deleteStableHorse,
  rollHat,
  equipHat,
  createWebSession,
} = api;
