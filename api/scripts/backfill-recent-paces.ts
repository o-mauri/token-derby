// One-off: stamp scoring spans from surviving series points, then rebuild every
// stable horse's recent_paces as raw output per present minute. Dry run unless --apply.
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../src/db/client.js';
import { RECENT_PACES_WINDOW, MIN_PACE_RACE_MINUTES } from '@token-derby/shared';
import { stableHorseKey, horseKey } from '../src/db/keys.js';
import { listSeriesPoints } from '../src/db/series.js';

const APPLY = process.argv.includes('--apply');
// Races from before input was always counted scored output only.
const OUTPUT_ONLY_SCALE = 10;

type Row = Record<string, any>;

async function scanAll(): Promise<Row[]> {
  const out: Row[] = [];
  let ExclusiveStartKey: Row | undefined;
  do {
    const res: any = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    out.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

async function spanFromPoints(race_id: string, horse_id: string): Promise<{ first: number; last: number } | null> {
  const points = (await listSeriesPoints(race_id, horse_id)).filter((p) => p.d > 0);
  if (points.length === 0) return null;
  return { first: points[0]!.t, last: points[points.length - 1]!.t };
}

async function main(): Promise<void> {
  const items = await scanAll();
  const meta = new Map<string, Row>();
  const horsesByRace = new Map<string, Row[]>();
  for (const it of items) {
    const pk = String(it.pk ?? ''), sk = String(it.sk ?? '');
    if (!pk.startsWith('RACE#')) continue;
    const rid = pk.slice(5);
    if (sk === 'META') meta.set(rid, it);
    else if (sk.startsWith('HORSE#')) horsesByRace.set(rid, [...(horsesByRace.get(rid) ?? []), it]);
  }

  let stamped = 0;
  const paces = new Map<string, { user_id: string; rows: Array<{ t: number; pace: number }> }>();
  for (const [rid, horses] of horsesByRace) {
    const m = meta.get(rid);
    if (!m?.ended_at) continue;
    const endMs = Date.parse(m.ended_at);
    if (!Number.isFinite(endMs)) continue;
    for (const h of horses) {
      const horse_id = String(h.sk).slice('HORSE#'.length);
      let first = h.first_scored_at ? Date.parse(h.first_scored_at) : NaN;
      let last = h.last_scored_at ? Date.parse(h.last_scored_at) : NaN;
      if (!Number.isFinite(first) || !Number.isFinite(last)) {
        const span = await spanFromPoints(rid, horse_id);
        if (span) {
          first = span.first; last = span.last;
          stamped++;
          if (APPLY) {
            await ddb.send(new UpdateCommand({
              TableName: TABLE, Key: horseKey(rid, horse_id),
              UpdateExpression: 'SET first_scored_at = if_not_exists(first_scored_at, :f), last_scored_at = if_not_exists(last_scored_at, :l)',
              ExpressionAttributeValues: { ':f': new Date(first).toISOString(), ':l': new Date(last).toISOString() },
            }));
          }
        }
      }
      const sid = h.stable_horse_id, uid = h.user_id;
      if (!sid || !uid) continue;
      const raw = Number(h.final_tokens ?? h.current_tokens ?? 0);
      const windowMin = Number.isFinite(first) && Number.isFinite(last)
        ? (last - first) / 60_000
        : (endMs - Date.parse(h.joined_at)) / 60_000;
      if (!(windowMin >= MIN_PACE_RACE_MINUTES)) continue;
      const scale = m.counts_input || h.model_tokens ? 1 : OUTPUT_ONLY_SCALE;
      const entry = paces.get(sid) ?? { user_id: uid, rows: [] };
      entry.rows.push({ t: endMs, pace: Math.max(0, (raw * scale) / windowMin) });
      paces.set(sid, entry);
    }
  }

  let written = 0;
  const skipped: string[] = [];
  for (const [sid, { user_id, rows }] of paces) {
    rows.sort((a, b) => a.t - b.t);
    const recent = rows.slice(-RECENT_PACES_WINDOW).map((r) => r.pace);
    console.log(`${sid}  races=${rows.length}  prior=${(recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(0)}`);
    if (!APPLY) continue;
    try {
      await ddb.send(new UpdateCommand({
        TableName: TABLE, Key: stableHorseKey(user_id, sid),
        UpdateExpression: 'SET recent_paces = :p', ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: { ':p': recent },
      }));
      written++;
    } catch (e: any) {
      if (e?.name !== 'ConditionalCheckFailedException') throw e;
      skipped.push(sid);
    }
  }
  if (skipped.length) console.log(`\nskipped ${skipped.length} deleted horse(s): ${skipped.join(', ')}`);
  console.log(`\nspans ${APPLY ? 'stamped' : 'to stamp'}: ${stamped}`);
  console.log(APPLY ? `wrote ${written} horses` : `dry run: ${paces.size} horses would be written`);
}

main().catch((e) => { console.error(e); process.exit(1); });
