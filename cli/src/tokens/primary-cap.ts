// Per-race cap: when a race has primary_top5 on, only the 5 largest
// per-conversation deltas count for the primary model each heartbeat. Off
// (default) → no cap (Infinity), i.e. sum all conversations.

/** How many conversations count per heartbeat for the primary when the cap is on. */
export const PRIMARY_TOP_CONVERSATIONS = 5;

/** The per-beat primary conversation cap: 5 when enabled, Infinity when off. */
export function primaryConversationCap(enabled: boolean): number {
  return enabled ? PRIMARY_TOP_CONVERSATIONS : Infinity;
}
