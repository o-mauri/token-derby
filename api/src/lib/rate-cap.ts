const DEFAULT_MAX_RATE_PER_SECOND = 7_500;

function envRate(): number {
  const n = Number(process.env.TOKEN_DERBY_MAX_RATE);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_RATE_PER_SECOND;
}

export type ClampDeltaInput = {
  delta: number;
  elapsedMs: number;
  max_rate_per_second?: number;
};

// Clamp a proposed per-heartbeat increment to [0, rate × elapsed]. There is no
// monotonic floor here — the server accumulates these increments.
export function clampDelta(input: ClampDeltaInput): number {
  const rate = input.max_rate_per_second ?? envRate();
  const elapsedSeconds = Math.max(0, input.elapsedMs) / 1000;
  const ceiling = rate * elapsedSeconds;
  return Math.min(Math.max(0, input.delta), ceiling);
}
