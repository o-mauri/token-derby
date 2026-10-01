// Seeded randomness for the odds engine: the same inputs always give the same draws.

/** FNV-1a over the parts, NUL-separated so ("ab","c") and ("a","bc") differ. */
export function hashSeed(...parts: string[]): number {
  const text = parts.join('\u0000');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Marsaglia-Tsang. Gamma rather than normal because output is non-negative and right-skewed.
export function gammaSampler(rnd: () => number): (k: number) => number {
  const normal = (): number => {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const draw = (k: number): number => {
    if (k < 1) return draw(1 + k) * Math.pow(rnd(), 1 / k);
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x = 0, v = 0;
      do { x = normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rnd();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  return draw;
}
