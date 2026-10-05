import type { FinishView } from '../models';

const COLOURS = [
  { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' },
  { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' },
  { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' },
  { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' },
  { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' },
];
const NAMES = ['Stormbringer', 'Pegasus', 'Cloudrunner', 'Thunderbolt', 'Embers', 'Misty', 'Comet', 'Blaze', 'Shadow', 'Dash',
  'Nova', 'Rocket', 'Ziggy', 'Tornado', 'Bandit', 'Hay Wire', 'Colt Runtime', 'Foal Stack', 'Pony Express'];
const OWNERS = ['Alice', 'Bob', 'Carol', 'Dan', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'];
const HATS = ['stetson', 'viking_helmet', 'party_hat', null, 'london_bus', null, 'beanie', 'rainbow_crown', null, 'fez'];

/** A realistic finished field for stories: some horses level up, some don't. */
export function finishedField(size = 19): FinishView[] {
  const winner = 4280;
  return Array.from({ length: size }, (_, i) => {
    const tokens = Math.max(60, Math.round(winner - i * 260 - (i % 3) * 45));
    const hat = HATS[i % HATS.length];
    return {
      id: `h${i}`, position: i + 1, name: NAMES[i % NAMES.length]!, owner: OWNERS[i % OWNERS.length]!,
      colors: COLOURS[i % COLOURS.length]!, hat: hat ? { id: hat } : null, tokens, behind: i === 0 ? null : winner - tokens,
      // Every third horse crosses a level boundary.
      xpBefore: i % 3 === 0 ? 140 : 60 + i * 9, xpAwarded: i % 3 === 0 ? 40 : 35 - Math.min(i, 13),
    };
  });
}
