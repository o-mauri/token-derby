import { describe, it, expect } from 'vitest';
import { putUser, getUserNamesByIds } from '../../src/db/users.js';

const uid = () => `u-batch-${Math.random().toString(36).slice(2)}`;

describe('getUserNamesByIds', () => {
  it('maps each id to its display name', async () => {
    const a = uid();
    const b = uid();
    await putUser({ user_id: a, display_name: 'Alice', created_at: '2026-04-01T00:00:00.000Z' }, 'HASH_A');
    await putUser({ user_id: b, display_name: 'Bob', created_at: '2026-04-01T00:00:00.000Z' }, 'HASH_B');

    const names = await getUserNamesByIds([a, b]);
    expect(names.get(a)).toBe('Alice');
    expect(names.get(b)).toBe('Bob');
  });

  it('returns an empty map for no ids without hitting the table', async () => {
    expect(await getUserNamesByIds([])).toEqual(new Map());
  });

  it('omits ids that have no user row', async () => {
    const real = uid();
    await putUser({ user_id: real, display_name: 'Real', created_at: '2026-04-01T00:00:00.000Z' }, 'H');
    const names = await getUserNamesByIds([real, 'u-does-not-exist']);
    expect(names.get(real)).toBe('Real');
    expect(names.has('u-does-not-exist')).toBe(false);
  });

  it('deduplicates repeated ids and ignores empty strings', async () => {
    const a = uid();
    await putUser({ user_id: a, display_name: 'Solo', created_at: '2026-04-01T00:00:00.000Z' }, 'H');
    const names = await getUserNamesByIds([a, a, '', a]);
    expect(names.size).toBe(1);
    expect(names.get(a)).toBe('Solo');
  });

  it('handles more than one BatchGet chunk', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 101; i++) {
      const id = uid();
      ids.push(id);
      await putUser({ user_id: id, display_name: `U${i}`, created_at: '2026-04-01T00:00:00.000Z' }, 'H');
    }
    const names = await getUserNamesByIds(ids);
    expect(names.size).toBe(101);
    expect(names.get(ids[100]!)).toBe('U100');
  });
});
