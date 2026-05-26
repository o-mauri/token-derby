import { describe, it, expect, vi } from 'vitest';
import { rollCommand } from '../../src/commands/roll.js';
import * as endpoints from '../../src/api/endpoints.js';

describe('roll command', () => {
  it('exits 0 with a message when no horse has pending rolls', async () => {
    vi.spyOn(endpoints, 'listStable').mockResolvedValue({
      horses: [
        {
          stable_horse_id: 'h1',
          name: 'Alpha',
          colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' },
          created_at: '2026-01-01',
          xp: 0,
          last_rolled_level: 1,
        } as any,
      ],
    });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await rollCommand();
    expect(code).toBe(0);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('No rolls available'));
    spy.mockRestore();
  });
});
