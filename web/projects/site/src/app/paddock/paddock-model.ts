import type { HatRarity, StableHorse } from '@token-derby/shared';
import { hatById } from '@token-derby/shared';
import type { WornHat } from '@token-derby/ui';

export type Totals = { horses: number; races: number; wins: number; podiums: number; tokens: number; xp: number };
export type HatRow = { id: string; variant: number; name: string; rarity: HatRarity; equipped: boolean };

const n = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Sums across every horse; older horses missing a stat count it as 0. */
export function totals(horses: readonly StableHorse[]): Totals {
  return horses.reduce<Totals>((t, h) => ({
    horses: t.horses + 1, races: t.races + n(h.races_entered), wins: t.wins + n(h.wins),
    podiums: t.podiums + n(h.podiums), tokens: t.tokens + n(h.total_tokens), xp: t.xp + n(h.xp),
  }), { horses: 0, races: 0, wins: 0, podiums: 0, tokens: 0, xp: 0 });
}

/** Most wins first, then most races, then by name. */
export function sortStable(horses: readonly StableHorse[]): StableHorse[] {
  return [...horses].sort((a, b) => n(b.wins) - n(a.wins) || n(b.races_entered) - n(a.races_entered) || a.name.localeCompare(b.name));
}

export function bestHorse(horses: readonly StableHorse[]): StableHorse | null {
  return sortStable(horses)[0] ?? null;
}

export function avgFinish(h: StableHorse): string {
  const races = n(h.races_entered);
  const total = n(h.total_finishing_position);
  return races > 0 && total > 0 ? (total / races).toFixed(1) : '—';
}

/** The hat the horse wears, or null when nothing valid is equipped. */
export function wornHat(h: StableHorse): WornHat | null {
  const i = h.equipped_hat;
  const c = typeof i === 'number' ? h.hats?.[i] : undefined;
  return c ? { id: c.id, variant: c.variant ?? 0 } : null;
}

/** Every hat the horse owns, newest first by full timestamp; undated ones last. */
export function hatCollection(h: StableHorse): HatRow[] {
  const time = (s: string | undefined) => { const t = Date.parse(s ?? ''); return Number.isNaN(t) ? -Infinity : t; };
  return (h.hats ?? [])
    .map((c, index) => ({ c, index }))
    .sort((a, b) => time(b.c.obtained_at) - time(a.c.obtained_at))
    .map(({ c, index }) => {
      const def = hatById(c.id);
      return { id: c.id, variant: c.variant ?? 0, name: def?.name ?? c.id, rarity: def?.rarity ?? 'common', equipped: h.equipped_hat === index };
    });
}
