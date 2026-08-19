import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { claimCommand } from '../../src/commands/claim.js';
import { probeClaim, redeemClaim, listStable } from '../../src/api/endpoints.js';
import { runReveal } from '../../src/ui/reveal.js';
import { ApiError } from '../../src/api/client.js';

const horse = {
  stable_horse_id: 'sh-1', name: 'Gary',
  colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
  created_at: '2026-01-01T00:00:00Z', xp: 0,
};

beforeEach(() => { vi.clearAllMocks(); });

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
    vi.mocked(probeClaim).mockResolvedValue({ item_type: 'hat' });
    vi.mocked(listStable).mockResolvedValue({ horses: [] } as any);
    expect(await claimCommand('ABCD-EFGH-JKLM')).toBe(1);
    expect(redeemClaim).not.toHaveBeenCalled();
  });

  it('probes before listing the stable', async () => {
    const order: string[] = [];
    vi.mocked(probeClaim).mockImplementation(async () => { order.push('probe'); return { item_type: 'hat' }; });
    vi.mocked(listStable).mockImplementation(async () => { order.push('stable'); return { horses: [] } as any; });
    await claimCommand('ABCD-EFGH-JKLM');
    expect(order).toEqual(['probe', 'stable']);
  });
});
