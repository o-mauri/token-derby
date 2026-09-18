import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('../../src/api/endpoints.js', () => ({
  probeClaim: vi.fn(),
  redeemClaim: vi.fn(),
  listStable: vi.fn(),
  equipHat: vi.fn(),
}));
vi.mock('../../src/ui/reveal.js', () => ({ runReveal: vi.fn(async () => {}) }));
vi.mock('../../src/ui/prompt.js', () => ({
  promptYesNo: vi.fn(async () => false),
  resetStdinAfterInk: vi.fn(),
}));
// The picker is an Ink render; cancel it immediately so the command returns
// without a live terminal UI. Cancelling still prints the opening line.
vi.mock('ink', () => ({
  render: (el: any) => {
    queueMicrotask(() => el.props.onCancel());
    return { unmount: vi.fn() };
  },
}));

import { claimCommand } from '../../src/commands/claim.js';
import { probeClaim, redeemClaim, listStable, equipHat } from '../../src/api/endpoints.js';
import { promptYesNo } from '../../src/ui/prompt.js';
import { runReveal } from '../../src/ui/reveal.js';
import { ApiError } from '../../src/api/client.js';

const horse = {
  stable_horse_id: 'sh-1', name: 'Gary',
  colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
  created_at: '2026-01-01T00:00:00Z', xp: 0,
};

const horse2 = { ...horse, stable_horse_id: 'sh-2', name: 'Bess' };

let out: string[];
let errs: string[];
let tmp: string;
let stdinTty: PropertyDescriptor | undefined;
let stdoutTty: PropertyDescriptor | undefined;

/** Horse resolution asks whether Ink can draw, so each test has to say. */
function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
}

beforeEach(async () => {
  vi.clearAllMocks();
  out = [];
  errs = [];
  // A real prefs.json on the machine running the tests must not decide which
  // horse these cases pick.
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-claim-'));
  process.env.TOKEN_DERBY_HOME = tmp;
  stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  setTty(true);
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errs.push(a.join(' ')); });
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  if (stdinTty) Object.defineProperty(process.stdin, 'isTTY', stdinTty);
  if (stdoutTty) Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('claimCommand', () => {
  it('exits 2 with usage when no token is given', async () => {
    expect(await claimCommand(undefined)).toBe(2);
    expect(probeClaim).not.toHaveBeenCalled();
  });

  it('reports an invalid token and never opens the picker', async () => {
    vi.mocked(probeClaim).mockRejectedValue(new ApiError('CLAIM_NOT_FOUND', 'No such claim token', 404));
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(1);
    expect(listStable).not.toHaveBeenCalled();
    expect(runReveal).not.toHaveBeenCalled();
  });

  it('reports an expired token', async () => {
    vi.mocked(probeClaim).mockRejectedValue(new ApiError('CLAIM_EXPIRED', 'expired', 410));
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(1);
  });

  it('stops when the stable is empty', async () => {
    vi.mocked(probeClaim).mockResolvedValue({ item_type: 'hat', entry_count: 1, remaining: 1 });
    vi.mocked(listStable).mockResolvedValue({ horses: [] } as any);
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(1);
    expect(redeemClaim).not.toHaveBeenCalled();
  });

  it('probes before listing the stable', async () => {
    const order: string[] = [];
    vi.mocked(probeClaim).mockImplementation(async () => { order.push('probe'); return { item_type: 'hat', entry_count: 1, remaining: 1 }; });
    vi.mocked(listStable).mockImplementation(async () => { order.push('stable'); return { horses: [] } as any; });
    await claimCommand('ABCD-EFGH-JKLM');
    expect(order).toEqual(['probe', 'stable']);
  });
});

describe('claim opening line', () => {
  // Two horses so the picker is still mounted (and cancelled) after the
  // opening line: a stable of one is now resolved without asking.
  const stocked = () => vi.mocked(listStable).mockResolvedValue({ horses: [horse, horse2] } as any);

  it('announces a single cosmetic for a one-entry claim', async () => {
    vi.mocked(probeClaim).mockResolvedValue({ item_type: 'hat', entry_count: 1, remaining: 1 });
    stocked();
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(0);
    expect(out.join('\n')).toContain('A cosmetic has been awarded to you');
  });

  it('announces a pack without naming its contents', async () => {
    vi.mocked(probeClaim).mockResolvedValue({ item_type: 'hat', entry_count: 5, remaining: 20 });
    stocked();
    await claimCommand('ABCD-EFGH-JKLM');
    const joined = out.join('\n');
    expect(joined).toContain('pack of 5');
    expect(joined).not.toContain('flat_cap');
  });

  it('surfaces CLAIM_EXHAUSTED from the probe without listing the stable', async () => {
    vi.mocked(probeClaim).mockRejectedValue(
      new ApiError('CLAIM_EXHAUSTED', 'This claim token has been fully redeemed', 409));
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(1);
    expect(errs.join('\n')).toContain('CLAIM_EXHAUSTED');
    expect(listStable).not.toHaveBeenCalled();
  });
});

describe('claim horse selection', () => {
  const redeemed = () => vi.mocked(redeemClaim).mockResolvedValue(
    { result: 'hat', collected: { id: 'flat_cap', variant: 0 }, hat_index: 0 } as any);

  beforeEach(() => {
    vi.mocked(probeClaim).mockResolvedValue({ item_type: 'hat', entry_count: 1, remaining: 1 });
  });

  it('uses the only horse without asking', async () => {
    vi.mocked(listStable).mockResolvedValue({ horses: [horse] } as any);
    redeemed();
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(0);
    expect(redeemClaim).toHaveBeenCalledWith('ABCD-EFGH-JKLM', { stable_horse_id: 'sh-1' });
    expect(out.join('\n')).toContain('your only horse');
  });

  it('honours --horse when several could be meant', async () => {
    vi.mocked(listStable).mockResolvedValue({ horses: [horse, horse2] } as any);
    redeemed();
    expect(await claimCommand('ABCD-EFGH-JKLM', ['--horse', 'Bess'])).toBe(0);
    expect(redeemClaim).toHaveBeenCalledWith('ABCD-EFGH-JKLM', { stable_horse_id: 'sh-2' });
  });

  it('spends nothing when --horse names a horse that is not there', async () => {
    vi.mocked(listStable).mockResolvedValue({ horses: [horse, horse2] } as any);
    expect(await claimCommand('ABCD-EFGH-JKLM', ['--horse', 'ghost'])).toBe(1);
    expect(redeemClaim).not.toHaveBeenCalled();
    expect(errs.join('\n')).toContain('ghost');
  });

  // The bug that started all this: outside a terminal the picker used to crash
  // inside Ink. Say what is wrong, and leave the token unspent.
  it('explains itself outside a terminal instead of crashing', async () => {
    setTty(false);
    vi.mocked(listStable).mockResolvedValue({ horses: [horse, horse2] } as any);
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(1);
    expect(redeemClaim).not.toHaveBeenCalled();
    const joined = errs.join('\n');
    expect(joined).toContain('--horse');
    expect(joined).toContain('unspent');
  });

  // readline never answers on a non-terminal stdin, so the old prompt would
  // have hung the run at its last step.
  it('does not stop to ask about equipping when it cannot be answered', async () => {
    setTty(false);
    vi.mocked(listStable).mockResolvedValue({ horses: [horse] } as any);
    redeemed();
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(0);
    expect(promptYesNo).not.toHaveBeenCalled();
    expect(equipHat).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('stable edit');
  });

  it('still offers to equip when there is a terminal', async () => {
    vi.mocked(listStable).mockResolvedValue({ horses: [horse] } as any);
    redeemed();
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(0);
    expect(promptYesNo).toHaveBeenCalled();
  });

  it('needs no terminal once a stable of one settles it', async () => {
    setTty(false);
    vi.mocked(listStable).mockResolvedValue({ horses: [horse] } as any);
    redeemed();
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(0);
    expect(redeemClaim).toHaveBeenCalledWith('ABCD-EFGH-JKLM', { stable_horse_id: 'sh-1' });
  });
});
