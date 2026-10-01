import { Window } from 'happy-dom';
import { beforeEach } from 'vitest';

// Node ships its own `localStorage` global that is inert without
// --localstorage-file, and it shadows the one happy-dom provides.
// Point it at a real happy-dom Storage, cleared between tests.
const { localStorage } = new Window();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorage,
  configurable: true,
  writable: true,
});

beforeEach(() => {
  localStorage.clear();
});
