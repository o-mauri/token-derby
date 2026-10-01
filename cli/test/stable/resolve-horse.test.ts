import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { StableHorse } from '@token-derby/shared';
import { resolveHorse, noticeFor } from '../../src/stable/resolve-horse.js';
import { setDefaultHorse } from '../../src/stable/prefs.js';

function horse(id: string, name: string, xp = 0): StableHorse {
  return {
    stable_horse_id: id,
    name,
    colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' },
    created_at: '2026-01-01T00:00:00.000Z',
    xp,
  };
}

const ONE = [horse('h1', 'solo')];
const MANY = [horse('h1', 'first'), horse('h2', 'second')];

let tmp: string;
let stdin: unknown;
let stdout: unknown;

/** Ink only mounts on a real terminal, so every case has to state which it is. */
function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-resolve-'));
  process.env.TOKEN_DERBY_HOME = tmp;
  stdin = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  stdout = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  setTty(true);
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  if (stdin) Object.defineProperty(process.stdin, 'isTTY', stdin as PropertyDescriptor);
  if (stdout) Object.defineProperty(process.stdout, 'isTTY', stdout as PropertyDescriptor);
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('resolveHorse', () => {
  it('reports an empty stable before anything else', async () => {
    expect(await resolveHorse([], { name: 'solo' })).toEqual({ kind: 'empty' });
  });

  it('uses the only horse in a stable of one', async () => {
    const choice = await resolveHorse(ONE);
    expect(choice).toMatchObject({ kind: 'resolved', via: 'only' });
  });

  it('asks when several horses and no default', async () => {
    expect(await resolveHorse(MANY)).toEqual({ kind: 'pick' });
  });

  it('uses the stored default when several horses', async () => {
    await setDefaultHorse('h2');
    const choice = await resolveHorse(MANY);
    expect(choice).toMatchObject({ kind: 'resolved', via: 'default' });
    expect(choice.kind === 'resolved' && choice.horse.name).toBe('second');
  });

  it('--horse beats the stored default', async () => {
    await setDefaultHorse('h2');
    const choice = await resolveHorse(MANY, { name: 'first' });
    expect(choice).toMatchObject({ kind: 'resolved', via: 'flag' });
    expect(choice.kind === 'resolved' && choice.horse.name).toBe('first');
  });

  it('reports a --horse name that is not in the stable', async () => {
    expect(await resolveHorse(MANY, { name: 'ghost' })).toEqual({ kind: 'not_found', name: 'ghost' });
  });

  it('--pick overrides the stored default', async () => {
    await setDefaultHorse('h2');
    expect(await resolveHorse(MANY, { pick: true })).toEqual({ kind: 'pick' });
  });

  // The default outlives the horse it names: a stale id must not strand the
  // command on a horse that no longer exists.
  it('ignores a default pointing at a deleted horse', async () => {
    await setDefaultHorse('gone');
    expect(await resolveHorse(MANY)).toEqual({ kind: 'pick' });
  });

  it('falls back to the only horse when the default is stale', async () => {
    await setDefaultHorse('gone');
    expect(await resolveHorse(ONE)).toMatchObject({ kind: 'resolved', via: 'only' });
  });

  describe('without a terminal', () => {
    beforeEach(() => setTty(false));

    it('says so instead of mounting a picker it cannot draw', async () => {
      expect(await resolveHorse(MANY)).toEqual({ kind: 'no_tty' });
    });

    it('still resolves from the default, which needs no terminal', async () => {
      await setDefaultHorse('h2');
      expect(await resolveHorse(MANY)).toMatchObject({ kind: 'resolved', via: 'default' });
    });

    it('still resolves a stable of one', async () => {
      expect(await resolveHorse(ONE)).toMatchObject({ kind: 'resolved', via: 'only' });
    });

    it('still resolves --horse', async () => {
      expect(await resolveHorse(MANY, { name: 'first' })).toMatchObject({ kind: 'resolved', via: 'flag' });
    });
  });

  // roll spends a consumable, so its picker is a confirmation step that only an
  // explicit --horse may skip.
  describe('autoSelect: false', () => {
    it('asks even in a stable of one', async () => {
      expect(await resolveHorse(ONE, { autoSelect: false })).toEqual({ kind: 'pick' });
    });

    it('asks even when a default is set', async () => {
      await setDefaultHorse('h2');
      expect(await resolveHorse(MANY, { autoSelect: false })).toEqual({ kind: 'pick' });
    });

    it('still honours --horse', async () => {
      expect(await resolveHorse(MANY, { name: 'second', autoSelect: false }))
        .toMatchObject({ kind: 'resolved', via: 'flag' });
    });
  });
});

describe('noticeFor', () => {
  it('says nothing when the user named the horse', () => {
    expect(noticeFor({ kind: 'resolved', horse: horse('h1', 'first'), via: 'flag' })).toBeNull();
  });

  it('names the horse and the override when it chose for them', () => {
    const notice = noticeFor({ kind: 'resolved', horse: horse('h1', 'first'), via: 'default' });
    expect(notice).toContain('your default horse');
    expect(notice).toContain('first');
    expect(notice).toContain('--horse');
  });

  it('distinguishes a stable of one from a stored default', () => {
    const notice = noticeFor({ kind: 'resolved', horse: horse('h1', 'solo'), via: 'only' });
    expect(notice).toContain('your only horse');
  });
});
