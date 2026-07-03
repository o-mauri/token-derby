import type { ScheduledHandler } from 'aws-lambda';
import { pruneSeriesPointsOlderThan } from '../db/series.js';

// Series points (the per-heartbeat chart data) are the bulk of the table and
// only power the finished-race token graphs. We keep two weeks of them; beyond
// that, a finished race still shows its standings/podium normally — just no
// graph (the chart hides itself when a race has no points).
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

// Fired on a daily schedule by EventBridge. Deletes series points older than the
// retention window to keep the table small.
export const handler: ScheduledHandler = async () => {
  const cutoff = Date.now() - RETENTION_MS;
  const deleted = await pruneSeriesPointsOlderThan(cutoff);
  console.log(`[prune-series] deleted ${deleted} series point(s) older than ${new Date(cutoff).toISOString()}`);
};
