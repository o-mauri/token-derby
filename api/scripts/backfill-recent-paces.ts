// One-off: reconstruct recent_paces for every stable horse from finished
// races already in the table. Idempotent — it overwrites rather than
// appending, so re-running is safe. Run with --apply to write; default is a
// dry run.
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../src/db/client.js';
import { tokenMultiplier, RECENT_PACES_WINDOW, MIN_PACE_RACE_MINUTES } from '@token-derby/shared';
import { stableHorseKey } from '../src/db/keys.js';

const APPLY = process.argv.includes('--apply');

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

async function main(): Promise<void> {
  const items = await scanAll();
  const meta = new Map<string, Row>();
  const horsesByRace = new Map<string, Row[]>();
  for (const it of items) {
    const pk = String(it.pk ?? ''), sk = String(it.sk ?? '');
    if (!pk.startsWith('RACE#')) continue;
    const rid = pk.slice(5);
    if (sk === 'META') meta.set(rid, it);
    else if (sk.startsWith('HORSE#')) {
      const list = horsesByRace.get(rid) ?? [];
      list.push(it);
      horsesByRace.set(rid, list);
    }
  }

  // (stable_horse_id) -> { user_id, rows: [{ t, pace }] }, chronological by
  // ended_at — the instant a live finalisation would have appended it.
  const paces = new Map<string, { user_id: string; rows: Array<{ t: number; pace: number }> }>();
  for (const [rid, horses] of horsesByRace) {
    const m = meta.get(rid);
    // Only races that actually finished carry ended_at — final_tokens/
    // final_scored_tokens are only stamped at finalisation, so an
    // unfinished race has nothing usable to backfill from.
    if (!m?.ended_at) continue;
    const endMs = new Date(m.ended_at).getTime();
    if (!Number.isFinite(endMs)) continue;
    const mult = tokenMultiplier({ counts_input: m.counts_input });
    for (const h of horses) {
      const sid = h.stable_horse_id, uid = h.user_id;
      if (!sid || !uid) continue;
      if (h.final_scored_tokens === undefined && h.final_tokens === undefined) continue;
      const joinedMs = new Date(h.joined_at).getTime();
      if (!Number.isFinite(joinedMs)) continue;
      const enrolledMin = Math.max(1, (endMs - joinedMs) / 60_000);
      if (!(enrolledMin >= MIN_PACE_RACE_MINUTES)) continue;   // too brief to mean anything
      const tokens = Number(h.final_scored_tokens ?? h.final_tokens ?? 0);
      const entry = paces.get(sid) ?? { user_id: uid, rows: [] as Array<{ t: number; pace: number }> };
      entry.rows.push({ t: endMs, pace: Math.max(0, tokens / mult / enrolledMin) });
      paces.set(sid, entry);
    }
  }

  let written = 0;
  const skipped: string[] = [];
  for (const [sid, { user_id, rows }] of paces) {
    rows.sort((a, b) => a.t - b.t);
    const recent = rows.slice(-RECENT_PACES_WINDOW).map((r) => r.pace);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    console.log(`${sid}  races=${rows.length}  prior=${avg.toFixed(0)}`);
    if (!APPLY) continue;
    try {
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: stableHorseKey(user_id, sid),
        UpdateExpression: 'SET recent_paces = :p',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: { ':p': recent },
      }));
      written++;
    } catch (e: any) {
      // A horse deleted after racing leaves its race rows behind but no stable
      // row to write to. Skip it rather than abandoning the horses queued after.
      if (e?.name !== 'ConditionalCheckFailedException') throw e;
      skipped.push(sid);
    }
  }
  if (skipped.length) {
    console.log(`\nskipped ${skipped.length} deleted horse(s): ${skipped.join(', ')}`);
  }
  console.log(APPLY ? `\nwrote ${written} horses` : `\ndry run — ${paces.size} horses would be written`);
}

main().catch((e) => { console.error(e); process.exit(1); });
