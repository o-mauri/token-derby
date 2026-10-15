import type { GetRaceSeriesResponse, HorseView } from '@token-derby/shared';

const NAMES = ['Stormbringer', 'Pegasus', 'Cloudrunner', 'Thunderbolt', 'Embers', 'Misty', 'Comet', 'Blaze', 'Shadow', 'Dash'];

/** A believable race for stories: `size` horses over `minutes`, each with its own rate and some bursts and lulls. */
export function raceFixture(size = 8, minutes = 120, divisions = 0): { series: GetRaceSeriesResponse; horses: HorseView[] } {
  const start = Date.UTC(2026, 9, 5, 9, 0);
  const end = start + minutes * 60_000;
  const seriesHorses = Array.from({ length: size }, (_, i) => {
    const rate = 50 - i * 4;
    const points = Array.from({ length: minutes }, (_, m) => {
      const wave = 1 + 0.6 * Math.sin((m + i * 7) / 9) + (m % (17 + i) === 0 ? 2 : 0);
      return { t: start + (m + 1) * 60_000, d: Math.max(0, Math.round(rate * wave)) };
    });
    return { horse_id: `h${i}`, points };
  });
  const totals = seriesHorses.map((h) => h.points.reduce((s, p) => s + p.d, 0));
  const order = totals.map((t, i) => [t, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const horses = seriesHorses.map((h, i) => ({
    horse_id: h.horse_id, name: NAMES[i % NAMES.length]!, rank: order.indexOf(i) + 1,
    division: divisions ? (i % divisions) + 1 : undefined,
    colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  }) as HorseView);
  return { series: { start_ms: start, end_ms: end, horses: seriesHorses }, horses };
}
