// Feature-flagged cap: when TOKEN_DERBY_PRIMARY_TOP5 is on, only the 5 largest
// per-conversation deltas count for the primary model each heartbeat. Off
// (default) → no cap (Infinity), i.e. sum all conversations as before.

/** How many conversations count per heartbeat for the primary when the flag is on. */
export const PRIMARY_TOP_CONVERSATIONS = 5;

/** The per-beat primary conversation cap: 5 when the flag is on, Infinity when off. */
export function primaryConversationCap(): number {
  const v = (process.env.TOKEN_DERBY_PRIMARY_TOP5 ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' ? PRIMARY_TOP_CONVERSATIONS : Infinity;
}
