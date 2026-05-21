import { tokenMultiplier } from '@token-derby/shared';

const DEFAULT_MAX_RATE_PER_SECOND = 500;

function envRate(): number {
  const n = Number(process.env.TOKEN_DERBY_MAX_RATE);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_RATE_PER_SECOND;
}

export type ClampHeartbeatInput = {
  previous_tokens: number;
  previous_heartbeat_iso: string;
  proposed_tokens: number;
  now: Date;
  max_rate_per_second?: number;
  counts_input?: boolean;
};

export function clampHeartbeat(input: ClampHeartbeatInput): number {
  const baseRate = input.max_rate_per_second ?? envRate();
  const rate = baseRate * tokenMultiplier({ counts_input: input.counts_input });
  const previousMs = Date.parse(input.previous_heartbeat_iso);
  const elapsedMs = Number.isFinite(previousMs) ? input.now.getTime() - previousMs : 0;
  const elapsedSeconds = Math.max(0, elapsedMs / 1000);
  const ceiling = input.previous_tokens + rate * elapsedSeconds;
  const bounded = Math.min(input.proposed_tokens, ceiling);
  return Math.max(input.previous_tokens, bounded);
}
