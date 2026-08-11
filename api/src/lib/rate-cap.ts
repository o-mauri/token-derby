import { tokenMultiplier } from '@token-derby/shared';

const DEFAULT_MAX_RATE_PER_SECOND = 750;

// The per-second rate actually enforced right now (env override or default),
// before the race's own token multiplier. Exported so anything reasoning
// about what a horse *can* produce — e.g. the market's "race is decided"
// check — agrees with the clamp that governs what it actually does produce.
export function envRate(): number {
  const n = Number(process.env.TOKEN_DERBY_MAX_RATE);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_RATE_PER_SECOND;
}

export type ClampDeltaInput = {
  delta: number;
  elapsedMs: number;
  counts_input?: boolean;
  max_rate_per_second?: number;
};

// Clamp a proposed per-heartbeat increment to [0, rate × elapsed]. The rate
// scales by TOKEN_INPUT_MULTIPLIER for input+output races. There is no
// monotonic floor here — the server accumulates these increments.
export function clampDelta(input: ClampDeltaInput): number {
  const baseRate = input.max_rate_per_second ?? envRate();
  const rate = baseRate * tokenMultiplier({ counts_input: input.counts_input });
  const elapsedSeconds = Math.max(0, input.elapsedMs) / 1000;
  const ceiling = rate * elapsedSeconds;
  return Math.min(Math.max(0, input.delta), ceiling);
}
