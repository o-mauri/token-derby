// site/test/derbymarket/picker.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RaceSummary } from '@token-derby/shared';
import {
  nextPendingRace, renderPickerSignedIn, renderPickerSignedOut, renderNoRaces, renderMarketNotFound,
} from '../../src/derbymarket/render/picker.js';

const race = (over: Partial<RaceSummary>): RaceSummary => ({
  race_id: 'r', name: 'League Race', join_code: 'ABC123',
  start_time: new Date().toISOString(), end_time: new Date().toISOString(), status: 'live', ...over,
});
const href = (p: string) => p;

describe('nextPendingRace', () => {
  it('picks the earliest pending race still to start', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    const a = race({ status: 'pending', start_time: '2026-10-03T06:00:00Z', join_code: 'LATER1' });
    const b = race({ status: 'pending', start_time: '2026-10-02T06:00:00Z', join_code: 'SOON11' });
    const done = race({ status: 'finished', start_time: '2026-10-01T06:00:00Z' });
    expect(nextPendingRace([a, done, b], now)?.join_code).toBe('SOON11');
    expect(nextPendingRace([done], now)).toBeNull();
  });
});

describe('renderPickerSignedIn', () => {
  it('lists each org with a live badge and a link to its market', () => {
    const root = document.createElement('div');
    renderPickerSignedIn(root, [
      { org_name: 'StackOne', live: race({ name: 'League Race 9/10' }), next: null },
      { org_name: 'Quiet', live: null, next: null },
    ], href);
    const links = [...root.querySelectorAll<HTMLAnchorElement>('a.dm-org-open')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/StackOne', '/Quiet']);
    expect(root.textContent).toContain('LIVE');
    expect(root.textContent).toContain('League Race 9/10');
    expect(root.textContent).toContain('NO RACE');
  });
});

describe('renderPickerSignedOut', () => {
  it('goes to the typed organisation', () => {
    const root = document.createElement('div');
    const onGo = vi.fn();
    renderPickerSignedOut(root, onGo);
    root.querySelector<HTMLInputElement>('#dm-org-input')!.value = 'stackone';
    root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onGo).toHaveBeenCalledWith('stackone');
  });
  it('ignores a name that cannot be an organisation', () => {
    const root = document.createElement('div');
    const onGo = vi.fn();
    renderPickerSignedOut(root, onGo);
    root.querySelector<HTMLInputElement>('#dm-org-input')!.value = 'not valid!';
    root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onGo).not.toHaveBeenCalled();
    expect(root.querySelector('.dm-picker-error')!.textContent).toContain('letters and numbers');
  });
  it('shows the CLI sign-in hint', () => {
    const root = document.createElement('div');
    renderPickerSignedOut(root, () => {});
    expect(root.textContent).toContain('token-derby derbymarket');
  });
});

describe('renderNoRaces / renderMarketNotFound', () => {
  it('says an org has no races yet, with the next one when scheduled', () => {
    const root = document.createElement('div');
    renderNoRaces(root, 'StackOne', race({ status: 'pending', name: 'League Race 1/10', start_time: new Date(Date.now() + 3_600_000).toISOString() }));
    expect(root.textContent).toContain('No races yet for StackOne');
    expect(root.textContent).toContain('League Race 1/10');
  });
  it('names the missing organisation and links back', () => {
    const root = document.createElement('div');
    renderMarketNotFound(root, 'acme', href);
    expect(root.textContent).toContain('acme');
    expect(root.querySelector<HTMLAnchorElement>('a')!.getAttribute('href')).toBe('/');
  });
  it('escapes the organisation name', () => {
    const root = document.createElement('div');
    renderMarketNotFound(root, '<img>', href);
    expect(root.querySelector('img')).toBeNull();
  });
});
