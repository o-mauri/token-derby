import { describe, it, expect, afterEach, vi } from 'vitest';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getHorseForHeartbeat, listHorses } from '../../src/db/horses.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { raceMetaKey, horseKey } from '../../src/db/keys.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';
import { staminaOf } from '@token-derby/shared';
import { CURRENT_CLI_VERSION, SAME_MINOR_CLI_VERSION, MISMATCHED_MINOR_CLI_VERSION, OUTDATED_CLI_VERSION } from '../helpers/cli-version.js';

const COLORS = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };

// Rewrite a live race's end_time so it reads as stale, without a real wait.
async function setRaceEndTime(race_id: string, end_time: string) {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: raceMetaKey(race_id),
    UpdateExpression: 'SET end_time = :e',
    ExpressionAttributeValues: { ':e': end_time },
  }));
}

// Move a race's start, so a live race reads as not yet started (or started) without a real wait.
async function setRaceStartTime(race_id: string, start_time: string) {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: raceMetaKey(race_id),
    UpdateExpression: 'SET start_time = :s',
    ExpressionAttributeValues: { ':s': start_time },
  }));
}

async function setup(cliVersion = CURRENT_CLI_VERSION) {
  const user = await makeUser('HB_User');
  const horse = await makeHorse(user, 'HB_Gary', COLORS);
  const createRes: any = await createHandler({
    version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': cliVersion, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify({
      name: 'HB Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }),
  });
  const { join_code, race_id } = JSON.parse(createRes.body);
  const joinRes: any = await joinHandler({
    version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
    pathParameters: { join_code },
    headers: { 'content-type': 'application/json', 'x-cli-version': cliVersion, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify({ stable_horse_id: horse.stable_horse_id }),
  });
  const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
  return { join_code, race_id, horse_id, heartbeat_token };
}

/**
 * Like setup() but switches mechanics on for the race.
 *
 * `legacy` writes the pre-`modifiers` flag instead, so the path a race created
 * before the settings map takes is covered by the same tests.
 */
async function setupLiveRaceWithHorse(
  opts: { stamina?: boolean; legacy?: boolean } = {},
): Promise<{ join_code: string; race_id: string; horse_id: string; token: string }> {
  const { join_code, race_id, horse_id, heartbeat_token } = await setup();
  if (opts.stamina) {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: raceMetaKey(race_id),
      ...(opts.legacy
        ? { UpdateExpression: 'SET stamina = :s', ExpressionAttributeValues: { ':s': true } }
        : {
            UpdateExpression: 'SET modifiers = :m',
            ExpressionAttributeValues: { ':m': { stamina: { enabled: true } } },
          }),
    }));
  }
  return { join_code, race_id, horse_id, token: heartbeat_token };
}

/**
 * Advances the (already-faked) clock by advanceMs and sends one heartbeat.
 * Callers must call vi.useFakeTimers() once themselves — re-installing it on
 * every call would reset the clock instead of accumulating time.
 */
async function heartbeat(opts: {
  join_code: string; horse_id: string; token: string; seq: number; delta: number; advanceMs: number;
}): Promise<Record<string, any>> {
  vi.advanceTimersByTime(opts.advanceMs);
  const res: any = await hbHandler(hbEvent(opts.join_code, opts.horse_id, opts.token, { seq: opts.seq, delta: opts.delta }));
  if (res.statusCode !== 200) {
    throw new Error(`heartbeat failed: ${res.statusCode} ${res.body}`);
  }
  return JSON.parse(res.body);
}

/** Like setup() but lets a test pin the CLI version sent at join time. */
async function setupWithCliVersion(cliVersion = CURRENT_CLI_VERSION) {
  const user = await makeUser('HB_PM_User');
  const horse = await makeHorse(user, 'HB_PM_Gary', COLORS);
  const createRes: any = await createHandler({
    version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': cliVersion, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify({
      name: 'HB PM Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }),
  });
  const { join_code, race_id } = JSON.parse(createRes.body);
  const joinBody: Record<string, unknown> = { stable_horse_id: horse.stable_horse_id };
  const joinRes: any = await joinHandler({
    version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
    pathParameters: { join_code },
    headers: { 'content-type': 'application/json', 'x-cli-version': cliVersion, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify(joinBody),
  });
  const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
  return { join_code, race_id, horse_id, heartbeat_token };
}

function hbEvent(
  join_code: string,
  horse_id: string,
  heartbeat_token: string | null,
  body: unknown,
  cliVersion: string | null = CURRENT_CLI_VERSION,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (heartbeat_token) headers.authorization = `Bearer ${heartbeat_token}`;
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  return {
    version: '2.0',
    routeKey: 'POST /races/{join_code}/horses/{horse_id}/heartbeat',
    rawPath: `/races/${join_code}/horses/${horse_id}/heartbeat`,
    rawQueryString: '',
    pathParameters: { join_code, horse_id },
    headers,
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('heartbeat handler', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('accumulates applied deltas onto current_tokens and returns last_seq', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    const r1: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1000 }));
    expect(r1.statusCode).toBe(200);
    expect(JSON.parse(r1.body).last_seq).toBe(1);
    await new Promise(r => setTimeout(r, 5));
    const r2: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 200 }));
    expect(JSON.parse(r2.body).last_seq).toBe(2);
    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(1200);
  });

  it('throws away whatever one beat claims above 5,000,000 raw tokens, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1, components: { anthropic: 0, openai: 30_405_384, google: 0 },
    }));
    expect(res.statusCode).toBe(200);
    const horse = (await listHorses(race_id))[0]!;
    expect(horse.current_tokens).toBe(5_000_000);
    expect(horse.model_tokens?.openai).toBe(5_000_000);
    expect(warn).toHaveBeenCalledWith('heartbeat over per-beat cap', expect.objectContaining({
      race_id, horse_id, cli_version: CURRENT_CLI_VERSION, claimed: 30_405_384, applied: 5_000_000, discarded: 25_405_384,
    }));
    warn.mockRestore();
  });

  describe('when the race has not started', () => {
    const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

    it('applies nothing, but still records the beat', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { join_code, race_id, horse_id, heartbeat_token } = await setup();
      await setRaceStartTime(race_id, FUTURE());
      const before = (await listHorses(race_id))[0]!;
      await new Promise(resolve => setTimeout(resolve, 5));

      const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 750_000 }));
      const horse = (await listHorses(race_id))[0]!;

      expect(JSON.parse(res.body).race_status).toBe('pending');
      expect(horse.current_tokens).toBe(0);
      expect(horse.scored_tokens).toBe(0);
      expect(horse.model_tokens?.anthropic).toBe(0);
      expect(horse.last_seq).toBe(1);
      expect(Date.parse(horse.last_heartbeat)).toBeGreaterThan(Date.parse(before.last_heartbeat));
      expect(warn).toHaveBeenCalledWith('heartbeat claimed tokens before the race started', expect.objectContaining({
        race_id, horse_id, cli_version: CURRENT_CLI_VERSION, claimed: 750_000,
      }));
      warn.mockRestore();
    });

    it('scores normally once the race has started', async () => {
      const { join_code, race_id, horse_id, heartbeat_token } = await setup();
      await setRaceStartTime(race_id, FUTURE());
      await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 10_000 }));
      await setRaceStartTime(race_id, new Date(Date.now() - 60_000).toISOString());

      await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 300 }));

      expect((await listHorses(race_id))[0]?.current_tokens).toBe(300);
    });
  });

  describe('the ledger a beat carries about its predecessor', () => {
    // Newer than the current release, in the same minor so the race's version pin still admits it.
    const LEDGER_CAPABLE_CLI_VERSION = SAME_MINOR_CLI_VERSION;
    const tokens = (anthropic: number) => ({ anthropic, openai: 0, google: 0 });

    // One horse, a few beats at a time, the way a CLI of the given version would send them.
    const raceOf = async (cliVersion = LEDGER_CAPABLE_CLI_VERSION) => {
      const ctx = await setup(cliVersion);
      const sendAs = async (version: string, body: Record<string, unknown>) => {
        const res: any = await hbHandler(hbEvent(ctx.join_code, ctx.horse_id, ctx.heartbeat_token, body, version));
        expect(res.statusCode).toBe(200);
        return JSON.parse(res.body);
      };
      const send = (body: Record<string, unknown>) => sendAs(cliVersion, body);
      const horse = async () => (await listHorses(ctx.race_id))[0]!;
      const stored = () => getHorseForHeartbeat(ctx.race_id, ctx.horse_id, ctx.heartbeat_token);
      // A write the CLI never made: tokens on the horse and a point on its chart, with
      // the seq moved on, as though another caller's beat had landed first.
      const plantForeignBeat = async (seq: number, amount: number) => {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: horseKey(ctx.race_id, ctx.horse_id),
          UpdateExpression: 'SET last_seq = :seq, model_tokens.#a = model_tokens.#a + :n ADD current_tokens :n, scored_tokens :n',
          ExpressionAttributeNames: { '#a': 'anthropic' },
          ExpressionAttributeValues: { ':seq': seq, ':n': amount },
        }));
        const { appendSeriesPoint } = await import('../../src/db/series.js');
        await appendSeriesPoint(ctx.race_id, ctx.horse_id, seq, { t: Date.now(), d: amount });
      };
      return { ...ctx, send, sendAs, horse, stored, plantForeignBeat };
    };

    it('gives a CLI that predates the ledger no base, and never checks it', async () => {
      const race = await raceOf(CURRENT_CLI_VERSION);
      await race.send({ seq: 1, components: tokens(100) });
      await race.plantForeignBeat(2, 5_000);
      await race.send({ seq: 3, components: tokens(10), previous: { seq: 2, components: tokens(30), counted: tokens(130) } });

      expect((await race.stored())?.ledger_base).toBeUndefined();
      expect((await race.horse()).current_tokens).toBe(5_110);
    });

    it('starts the check from the first beat of a CLI that sends one, which has no previous', async () => {
      const race = await raceOf();
      await race.send({ seq: 1, components: tokens(100) });
      expect((await race.stored())?.ledger_base).toEqual({ anthropic: 0, openai: 0, google: 0 });
    });

    it('leaves a consistent chain of beats alone', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const race = await raceOf();
      await race.send({ seq: 1, components: tokens(100) });
      await race.send({ seq: 2, components: tokens(50), previous: { seq: 1, components: tokens(100), counted: tokens(100) } });
      await race.send({ seq: 3, components: tokens(25), previous: { seq: 2, components: tokens(50), counted: tokens(150) } });

      expect((await race.horse()).current_tokens).toBe(175);
      expect(warn).not.toHaveBeenCalledWith('heartbeat ledger corrected', expect.anything());
      warn.mockRestore();
    });

    it('removes what the CLI never counted, and restores the beat it displaced', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const race = await raceOf();
      await race.send({ seq: 1, components: tokens(100) });
      await race.plantForeignBeat(2, 5_000);
      // The CLI's own seq 2 is dropped as a resend, so it resyncs and restates it with seq 3.
      await race.send({ seq: 2, components: tokens(30), previous: { seq: 1, components: tokens(100), counted: tokens(100) } });
      expect((await race.horse()).current_tokens).toBe(5_100);

      await race.send({ seq: 3, components: tokens(50), previous: { seq: 2, components: tokens(30), counted: tokens(130) } });

      const horse = await race.horse();
      expect(horse.current_tokens).toBe(180);
      expect(horse.scored_tokens).toBe(180);
      expect(horse.model_tokens?.anthropic).toBe(180);
      expect(warn).toHaveBeenCalledWith('heartbeat ledger corrected', expect.objectContaining({
        race_id: race.race_id, horse_id: race.horse_id, seq: 3, previous_seq: 2, cli_version: LEDGER_CAPABLE_CLI_VERSION,
      }));
      warn.mockRestore();
    });

    it('restates the previous beat\'s chart point so the graph still adds up to the horse', async () => {
      const { listSeriesPoints } = await import('../../src/db/series.js');
      const race = await raceOf();
      await race.send({ seq: 1, components: tokens(100) });
      await race.plantForeignBeat(2, 5_000);
      await race.send({ seq: 3, components: tokens(50), previous: { seq: 2, components: tokens(30), counted: tokens(130) } });

      const points = await listSeriesPoints(race.race_id, race.horse_id);
      const plotted = points.reduce((sum, point) => sum + (point.s ?? point.d), 0);
      expect(plotted).toBe((await race.horse()).scored_tokens);
    });

    it('gives back tokens the CLI counted that the server never applied, up to what that beat claimed', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const race = await raceOf();
      await race.send({ seq: 1, components: tokens(100) });
      await race.send({ seq: 2, components: tokens(10), previous: { seq: 1, components: tokens(100), counted: tokens(250) } });

      expect((await race.horse()).current_tokens).toBe(210);   // 100 + 10 + 100, not the 150 asked for
      warn.mockRestore();
    });

    it('corrects a drift once, not again on every later beat', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const race = await raceOf();
      await race.send({ seq: 1, components: tokens(100) });
      await race.send({ seq: 2, components: tokens(10), previous: { seq: 1, components: tokens(100), counted: tokens(250) } });
      await race.send({ seq: 3, components: tokens(10), previous: { seq: 2, components: tokens(10), counted: tokens(260) } });

      expect((await race.horse()).current_tokens).toBe(220);
      warn.mockRestore();
    });

    it('does not undo the pre-race gate by treating the ignored tokens as drift', async () => {
      const race = await raceOf();
      await setRaceStartTime(race.race_id, new Date(Date.now() + 60 * 60 * 1000).toISOString());
      await race.send({ seq: 1, components: tokens(750_000) });
      await setRaceStartTime(race.race_id, new Date(Date.now() - 60_000).toISOString());
      await race.send({ seq: 2, components: tokens(10), previous: { seq: 1, components: tokens(750_000), counted: tokens(750_000) } });

      expect((await race.horse()).current_tokens).toBe(10);
    });

    it('does not read what the sanity cap discarded as drift', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const race = await raceOf();
      await race.send({ seq: 1, components: tokens(30_000_000) });
      await race.send({ seq: 2, components: tokens(10), previous: { seq: 1, components: tokens(30_000_000), counted: tokens(30_000_000) } });

      expect((await race.horse()).current_tokens).toBe(5_000_010);
      warn.mockRestore();
    });

    it('treats a ledger it cannot read as a first beat, and checks nothing', async () => {
      const race = await raceOf();
      await race.send({ seq: 1, components: tokens(100) });
      await race.send({ seq: 2, components: tokens(10), previous: { seq: 'one', components: 'many' } as any });

      expect((await race.horse()).current_tokens).toBe(110);
      expect((await race.stored())?.ledger_base).toEqual({ anthropic: 100, openai: 0, google: 0 });
    });

    it('keeps the base out of the horses it returns', async () => {
      const race = await raceOf();
      const body = await race.send({ seq: 1, components: tokens(100) });
      expect(body.horses[0]).not.toHaveProperty('ledger_base');
      expect(await race.horse()).not.toHaveProperty('ledger_base');
    });

    describe('a racer\'s journey, as a CLI process would send it', () => {
      type Race = Awaited<ReturnType<typeof raceOf>>;

      // Acks and retries the way the CLI's tracker does: counted and the restated beat move
      // on a reply, a seq resyncs to the server's, and a retry reuses its seq.
      const processOn = (race: Race, options: { version?: string; startSeq?: number } = {}) => {
        const version = options.version ?? LEDGER_CAPABLE_CLI_VERSION;
        let seq = options.startSeq ?? 0;
        let counted = 0;
        let acked: { seq: number; components: ReturnType<typeof tokens> } | undefined;
        let inFlight: { seq: number; components: ReturnType<typeof tokens>; previous?: unknown } | undefined;

        const bodyFor = (delta: number) => ({
          seq: seq + 1,
          components: tokens(delta),
          ...(acked ? { previous: { seq: acked.seq, components: acked.components, counted: tokens(counted) } } : {}),
        });
        const settle = (body: { seq: number; components: ReturnType<typeof tokens> }, reply: { last_seq: number }) => {
          counted += body.components.anthropic;
          acked = { seq: body.seq, components: body.components };
          seq = Math.max(body.seq, reply.last_seq);
          inFlight = undefined;
        };
        return {
          beat: async (delta: number) => {
            const body = bodyFor(delta);
            settle(body, await race.sendAs(version, body));
          },
          // The server applied the beat but the reply never arrived, so nothing is acked.
          beatLosingReply: async (delta: number) => {
            inFlight = bodyFor(delta);
            await race.sendAs(version, inFlight);
          },
          // The same seq again, carrying whatever has been read since.
          retry: async (delta: number) => {
            const body = { ...inFlight!, components: tokens(delta) };
            settle(body, await race.sendAs(version, body));
          },
        };
      };

      it('a racer who joins mid-race is credited for exactly what they produce', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const race = await raceOf();
        const cli = processOn(race);
        for (const delta of [100, 40, 0, 60]) await cli.beat(delta);

        expect((await race.horse()).current_tokens).toBe(200);
        expect(warn).not.toHaveBeenCalledWith('heartbeat ledger corrected', expect.anything());
        warn.mockRestore();
      });

      it('a racer who joins before the start is credited from the gun, not for the wait', async () => {
        const race = await raceOf();
        await setRaceStartTime(race.race_id, new Date(Date.now() + 60 * 60 * 1000).toISOString());
        const cli = processOn(race);
        await cli.beat(0);
        await cli.beat(0);
        await setRaceStartTime(race.race_id, new Date(Date.now() - 60_000).toISOString());
        await cli.beat(100);
        await cli.beat(50);

        expect((await race.horse()).current_tokens).toBe(150);
      });

      it('a racer who restarts the CLI keeps what they had and carries on cleanly', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const race = await raceOf();
        const first = processOn(race);
        await first.beat(100);
        await first.beat(50);

        const second = processOn(race, { startSeq: 2 });
        await second.beat(70);
        await second.beat(30);

        expect((await race.horse()).current_tokens).toBe(250);
        expect(warn).not.toHaveBeenCalledWith('heartbeat ledger corrected', expect.anything());
        warn.mockRestore();
      });

      it('a racer who upgrades the CLI mid-race starts being checked without losing anything', async () => {
        const race = await raceOf();
        await race.sendAs(CURRENT_CLI_VERSION, { seq: 1, components: tokens(100) });
        await race.sendAs(CURRENT_CLI_VERSION, { seq: 2, components: tokens(50) });
        expect((await race.stored())?.ledger_base).toBeUndefined();

        const upgraded = processOn(race, { startSeq: 2 });
        await upgraded.beat(70);
        await upgraded.beat(30);

        expect((await race.horse()).current_tokens).toBe(250);
        expect((await race.stored())?.ledger_base).toEqual({ anthropic: 150, openai: 0, google: 0 });
      });

      it('a racer who drops back to an older CLI and upgrades again is checked afresh, without losing anything', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const race = await raceOf();
        const before = processOn(race);
        await before.beat(100);
        await race.sendAs(CURRENT_CLI_VERSION, { seq: 2, components: tokens(40) });

        const after = processOn(race, { startSeq: 2 });
        await after.beat(10);
        await after.beat(5);

        expect((await race.horse()).current_tokens).toBe(155);
        expect(warn).not.toHaveBeenCalledWith('heartbeat ledger corrected', expect.anything());
        warn.mockRestore();
      });

      it('a beat whose reply was lost is not counted twice, and what grew before the retry is not lost', async () => {
        const race = await raceOf();
        const cli = processOn(race);
        await cli.beat(100);
        await cli.beatLosingReply(40);
        await cli.retry(55);   // the server already has this seq, but 15 more has been read since
        await cli.beat(10);

        expect((await race.horse()).current_tokens).toBe(165);   // 100 + 55 + 10
      });

      it('a racer with an older-format model_tokens row keeps their tokens', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const race = await raceOf();
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: horseKey(race.race_id, race.horse_id),
          UpdateExpression: 'SET model_tokens = :old, current_tokens = :t, scored_tokens = :t',
          ExpressionAttributeValues: { ':old': { claude: 700, codex: 300, gemini: 0 }, ':t': 1000 },
        }));
        const cli = processOn(race);
        await cli.beat(100);
        await cli.beat(50);
        await cli.beat(25);

        expect((await race.horse()).current_tokens).toBe(1_175);
        expect(warn).not.toHaveBeenCalledWith('heartbeat ledger corrected', expect.anything());
        warn.mockRestore();
      });

      // Seeded, so a failure names the seed that reproduces it.
      const seeded = (seed: number) => {
        let state = seed >>> 0;
        return () => {
          state = (state * 1664525 + 1013904223) >>> 0;
          return state / 2 ** 32;
        };
      };

      it('a racer whose replies go missing, whose retries grow, and who restarts is still credited exactly', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        for (let seed = 1; seed <= 12; seed += 1) {
          const random = seeded(seed);
          const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
          const race = await raceOf();
          let cli = processOn(race);
          let produced = 0;
          let sent = 0;
          const beatEverything = async () => {
            const delta = produced - sent;
            await cli.beat(delta);
            sent += delta;
          };

          for (let step = 0; step < 25; step += 1) {
            produced += between(0, 400);
            const roll = random();
            if (roll < 0.7) {
              await beatEverything();
            } else if (roll < 0.85) {
              await cli.beatLosingReply(produced - sent);
              produced += between(0, 60);
              const grown = produced - sent;
              await cli.retry(grown);
              sent += grown;
            } else {
              await beatEverything();
              cli = processOn(race, { startSeq: (await race.stored())!.last_seq });
            }
          }
          await beatEverything();
          await cli.beat(0);   // a correction lands with the beat after the one it repairs

          expect(`seed ${seed}: ${(await race.horse()).current_tokens}`).toBe(`seed ${seed}: ${produced}`);
        }
        warn.mockRestore();
      }, 60_000);

      // Two processes racing for each seq drop each other's beats, which loses work with or
      // without the ledger. It is only asked here not to make that worse.
      it('two processes on one horse are never further from the real total than without the check', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const runSchedule = async (seed: number, version: string) => {
          const random = seeded(seed);
          const race = await raceOf(version);
          const first = processOn(race, { version });
          let produced = 100;
          let firstSent = 100;
          await first.beat(100);
          const second = processOn(race, { version, startSeq: 1 });
          let secondSent = 0;
          for (let step = 0; step < 12; step += 1) {
            produced += Math.floor(random() * 300);
            const order = random() < 0.5 ? [first, second] : [second, first];
            for (const cli of order) {
              if (random() < 0.15) continue;   // this process skips the tick
              const sentSoFar = cli === first ? firstSent : secondSent;
              const delta = produced - sentSoFar;
              await cli.beat(delta);
              if (cli === first) firstSent += delta; else secondSent += delta;
            }
          }
          return Math.abs((await race.horse()).current_tokens - produced);
        };

        for (let seed = 1; seed <= 12; seed += 1) {
          const withCheck = await runSchedule(seed, LEDGER_CAPABLE_CLI_VERSION);
          const without = await runSchedule(seed, CURRENT_CLI_VERSION);
          expect(`seed ${seed}: ${withCheck <= without}`).toBe(`seed ${seed}: true`);
        }
        warn.mockRestore();
      }, 60_000);

      const endRace = (race: Race) => setRaceEndTime(race.race_id, new Date(Date.now() - 1_000).toISOString());

      it('a beat that arrives after the race has ended applies nothing and leaves the check as it was', async () => {
        const race = await raceOf();
        const cli = processOn(race);
        await cli.beat(100);
        await cli.beat(50);
        const baseBefore = (await race.stored())?.ledger_base;

        await endRace(race);
        const reply = await race.send({ seq: 3, components: tokens(70), previous: { seq: 2, components: tokens(50), counted: tokens(150) } });

        expect(reply.race_status).toBe('finished');
        expect((await race.horse()).current_tokens).toBe(150);
        expect((await race.stored())?.ledger_base).toEqual(baseBefore);
      });

      it('a correction made on the last live beat is what the final standings are built from', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const race = await raceOf();
        await race.send({ seq: 1, components: tokens(100) });
        await race.plantForeignBeat(2, 5_000);
        await race.send({ seq: 3, components: tokens(50), previous: { seq: 2, components: tokens(30), counted: tokens(130) } });

        await endRace(race);
        await race.send({ seq: 4, components: tokens(10), previous: { seq: 3, components: tokens(50), counted: tokens(180) } });

        const horse = await race.horse();
        expect(horse.current_tokens).toBe(180);
        expect(horse.final_tokens).toBe(180);
        expect(horse.final_scored_tokens).toBe(180);
        warn.mockRestore();
      });

      it('a stray call after the last accepted beat stands in the final standings, because nothing is checked once the race is over', async () => {
        const race = await raceOf();
        const cli = processOn(race);
        await cli.beat(100);
        await race.plantForeignBeat(2, 5_000);

        await endRace(race);
        await race.send({ seq: 2, components: tokens(30), previous: { seq: 1, components: tokens(100), counted: tokens(100) } });

        expect((await race.horse()).final_tokens).toBe(5_100);
      });

      it('a beat that lands after the race has been finalised changes no total', async () => {
        const race = await raceOf();
        const cli = processOn(race);
        await cli.beat(100);
        await endRace(race);
        await race.send({ seq: 2, components: tokens(10), previous: { seq: 1, components: tokens(100), counted: tokens(100) } });
        const finalised = await race.horse();

        await race.send({ seq: 3, components: tokens(500), previous: { seq: 2, components: tokens(10), counted: tokens(110) } });

        const after = await race.horse();
        expect(after.current_tokens).toBe(finalised.current_tokens);
        expect(after.final_tokens).toBe(finalised.final_tokens);
      });

      it('two processes on one horse, in step and reading the same work, are credited for it once', async () => {
        const race = await raceOf();
        const first = processOn(race);
        await first.beat(100);
        const second = processOn(race, { startSeq: 1 });
        for (let tick = 0; tick < 4; tick += 1) {
          await first.beat(100);
          await second.beat(100);
        }
        // The real work is 500. Each tick the slower process's beat meets a seq already taken
        // and is dropped, so only one process's reading of it lands. Timing that interleaves
        // them differently is not covered.
        expect((await race.horse()).current_tokens).toBe(500);
      });
    });
  });

  it('dedups a resent seq (no double-apply)', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 500 }));
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 500 })); // resend
    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(500);
  });

  it('writes a series point for an applied delta', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 750 }));
    const { listSeriesPoints } = await import('../../src/db/series.js');
    const pts = await listSeriesPoints(race_id, horse_id);
    expect(pts).toHaveLength(1);
    expect(pts[0]?.d).toBe(750);
  });

  it('leaves the scored delta off a point no mechanic changed', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 750 }));
    const { listSeriesPoints } = await import('../../src/db/series.js');
    const pts = await listSeriesPoints(race_id, horse_id);
    // Repeating `d` on every point of every race that runs no mechanics would
    // be pure storage; absent reads as "unmodified", which it is.
    expect(pts[0]?.s).toBeUndefined();
  });

  it('records the scored delta on a point a mechanic changed', async () => {
    const { join_code, race_id, horse_id, token } = await setupLiveRaceWithHorse({ stamina: true });

    vi.useFakeTimers();
    // Flat out until the horse is well past the taper floor, so later beats
    // score below face value and the graph must show the difference.
    for (let seq = 1; seq <= 20; seq++) {
      await heartbeat({ join_code, horse_id, token, seq, delta: 400_000, advanceMs: 60_000 });
    }

    const { listSeriesPoints } = await import('../../src/db/series.js');
    const pts = await listSeriesPoints(race_id, horse_id);
    const tapered = pts.filter(p => p.s !== undefined);
    expect(tapered.length).toBeGreaterThan(0);
    for (const p of tapered) {
      expect(p.s!).toBeLessThan(p.d);
      expect(p.d).toBe(400_000);
    }

    // The cumulative graph is drawn from these; it must land on the horse's own
    // scored total rather than the raw one it would otherwise plot.
    const [horse] = await listHorses(race_id);
    const graphed = pts.reduce((sum, p) => sum + (p.s ?? p.d), 0);
    expect(graphed).toBe(horse!.scored_tokens);
    expect(graphed).toBeLessThan(horse!.current_tokens);
  });

  it('accumulates scored_tokens alongside current_tokens with no mechanics enabled', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 5_000 }));
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 3_000 }));
    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(8_000);
    expect(horses[0]?.scored_tokens).toBe(8_000);
  });

  it('seeds scored_tokens from current_tokens on a horse\'s first heartbeat', async () => {
    // Every horse row starts without scored_tokens — this isn't a deploy-time
    // migration, it's every horse's first heartbeat.
    const { join_code, race_id } = await setup();
    const { putHorse } = await import('../../src/db/horses.js');
    await putHorse(race_id, {
      horse_id: 'h-seed', stable_horse_id: 'sh-seed', name: 'Seed_Gary',
      colors: COLORS, current_tokens: 50_000, last_heartbeat: new Date().toISOString(),
      joined_at: new Date().toISOString(), user_id: 'seed-user', user_name: 'Seed_User', xp: 0,
    } as any, 'seed-tok');

    const res: any = await hbHandler(hbEvent(join_code, 'h-seed', 'seed-tok', { seq: 1, delta: 1_000 }));
    expect(res.statusCode).toBe(200);
    const horses = await listHorses(race_id);
    const own = horses.find(h => h.horse_id === 'h-seed');
    expect(own?.current_tokens).toBe(51_000);
    expect(own?.scored_tokens).toBe(51_000);
  });

  it('rejects a negative delta or non-positive seq', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup();
    expect((await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: -5 }))).statusCode).toBe(400);
    expect((await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 0, delta: 5 }))).statusCode).toBe(400);
  });

  it('rejects wrong heartbeat token', async () => {
    const { join_code, horse_id } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, 'wrong-token', { seq: 1, delta: 1 }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('INVALID_TOKEN');
  });

  it('rejects missing authorization header', async () => {
    const { join_code, horse_id } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, null, { seq: 1, delta: 1 }));
    expect(res.statusCode).toBe(401);
  });

  it('returns RACE_NOT_FOUND for unknown code', async () => {
    const res: any = await hbHandler(hbEvent('NOPE99', 'no-horse', 'tok', { seq: 1, delta: 0 }));
    expect(res.statusCode).toBe(404);
  });

  it('rejects heartbeat with mismatched minor version', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup(CURRENT_CLI_VERSION);
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1 }, MISMATCHED_MINOR_CLI_VERSION));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  it('accepts heartbeat with same minor but different patch', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup(CURRENT_CLI_VERSION);
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1 }, SAME_MINOR_CLI_VERSION));
    expect(res.statusCode).toBe(200);
  });

  it('rejects heartbeat with missing version header', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup(CURRENT_CLI_VERSION);
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1 }, null));
    expect(res.statusCode).toBe(426);
  });

  it('rejects heartbeat from a CLI version older than the API minimum', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1 }, OUTDATED_CLI_VERSION));
    expect(res.statusCode).toBe(426);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VERSION_MISMATCH');
    expect(body.message).toContain(CURRENT_CLI_VERSION);
  });

  it('returns ranked horses in the response so the CLI can render the leaderboard', async () => {
    const creator = await makeUser('HB_Creator');
    const createRes: any = await createHandler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': creator.user_id, 'x-user-token': creator.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({
        name: 'HB Multi',
        start_time: new Date(Date.now() - 60_000).toISOString(),
        end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        tz: 'UTC',
      }),
    });
    const { join_code } = JSON.parse(createRes.body);

    const joinOne = async (user: TestUser, name: string) => {
      const h = await makeHorse(user, name, COLORS);
      const jr: any = await joinHandler({
        version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
        pathParameters: { join_code },
        headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
        requestContext: {} as any, isBase64Encoded: false,
        body: JSON.stringify({ stable_horse_id: h.stable_horse_id }),
      });
      return JSON.parse(jr.body) as { horse_id: string; heartbeat_token: string };
    };

    const a = await joinOne(await makeUser('HB_Alpha'), 'Alpha');
    const b = await joinOne(await makeUser('HB_Beta'), 'Beta');
    const c = await joinOne(await makeUser('HB_Gamma'), 'Gamma');

    await hbHandler(hbEvent(join_code, a.horse_id, a.heartbeat_token, { seq: 1, delta: 100 }));
    await hbHandler(hbEvent(join_code, b.horse_id, b.heartbeat_token, { seq: 1, delta: 500 }));
    const res: any = await hbHandler(hbEvent(join_code, c.horse_id, c.heartbeat_token, { seq: 1, delta: 300 }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horses).toHaveLength(3);
    const byName = (n: string) => body.horses.find((h: any) => h.name === n);
    expect(byName('Beta').rank).toBe(1);
    expect(byName('Gamma').rank).toBe(2);
    expect(byName('Alpha').rank).toBe(3);
    expect(byName('Gamma').current_tokens).toBe(300);
    expect(body.race.name).toBe('HB Multi');
    expect(typeof body.race.start_time).toBe('string');
    expect(typeof body.race.end_time).toBe('string');
  });

  it('finalises a stale-live race when no one has called getRace yet', async () => {
    const user = await makeUser('HB_FinaliseUser');
    const horse = await makeHorse(user, 'HB_FinaliseGary', COLORS);
    const createRes: any = await createHandler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({
        name: 'HB Finalise',
        start_time: new Date(Date.now() - 60_000).toISOString(),
        end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        tz: 'UTC',
      }),
    });
    expect(createRes.statusCode).toBe(200);
    const { join_code, race_id } = JSON.parse(createRes.body);
    const joinRes: any = await joinHandler({
      version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
      pathParameters: { join_code },
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({ stable_horse_id: horse.stable_horse_id }),
    });
    expect(joinRes.statusCode).toBe(200);
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 4242 }));

    // Go stale by moving end_time into the past rather than waiting on it, so
    // the join above is never racing the race it is joining.
    await setRaceEndTime(race_id, new Date(Date.now() - 1_000).toISOString());

    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 9999 }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.race_status).toBe('finished');

    const { getRaceByJoinCode } = await import('../../src/db/races.js');
    const race = await getRaceByJoinCode(join_code);
    expect(race?.ended_at).toBeTruthy();

    const horses = await listHorses(race_id);
    expect(horses[0]?.final_tokens).toBe(4242);
  });

  it('returns finished status without writing when race has ended', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 777 }));

    const { setRaceEnded } = await import('../../src/db/races.js');
    await setRaceEnded(race_id, new Date().toISOString());

    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 9999 }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).race_status).toBe('finished');

    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(777);
  });

  it('accrues live_xp and recent_events across multiple heartbeats', async () => {
    // Use a race that started well before the warm-up window (>8% of total duration ago).
    const user = await makeUser('XP_User');
    const horse = await makeHorse(user, 'XP_Gary', COLORS);
    // Start 1 hour ago, end 1 hour from now — warm-up is 8% of 2h = ~9.6 min, well past it.
    const createRes: any = await createHandler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({
        name: 'XP Test',
        start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        tz: 'UTC',
      }),
    });
    const { join_code } = JSON.parse(createRes.body);
    const joinRes: any = await joinHandler({
      version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
      pathParameters: { join_code },
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({ stable_horse_id: horse.stable_horse_id }),
    });
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    // First heartbeat — initializes state.
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 100 }));
    await new Promise(r => setTimeout(r, 5));
    // Second heartbeat with a big token jump should trigger Stampede! (delta >= 70,000).
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 99_000 }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const own = body.horses.find((h: any) => h.horse_id === horse_id);
    expect(own.live_xp).toBe(2);
    expect(own.recent_events?.some((e: any) => e.name === 'Stampede!')).toBe(true);
  });

  it('rejects heartbeat when the version header is missing, even for a race without cli_version', async () => {
    const { putRace } = await import('../../src/db/races.js');
    const { putHorse } = await import('../../src/db/horses.js');
    const user = await makeUser('NoVer_User');
    const horse = await makeHorse(user, 'NoVer_Gary', COLORS);
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const join_code = `NV${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await putRace({
      race_id, name: 'NoVer', join_code,
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 3_600_000).toISOString(),
      tz: 'UTC', max_participants: 10, created_at: new Date().toISOString(),
      // intentionally no cli_version
    } as any, `admin-${Math.random().toString(36).slice(2)}`);
    await putHorse(race_id, {
      horse_id: 'h-nv', stable_horse_id: horse.stable_horse_id, name: 'NoVer_Gary',
      colors: COLORS, current_tokens: 0, last_heartbeat: new Date().toISOString(),
      joined_at: new Date().toISOString(), user_id: user.user_id, user_name: 'NoVer_User', xp: 0,
    } as any, 'tok');

    const res: any = await hbHandler(hbEvent(join_code, 'h-nv', 'tok', { seq: 1, delta: 0 }, null));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  // --- per-model components ---

  it('counts every model at equal weight', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setupWithCliVersion();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1,
      components: { anthropic: 1000, openai: 5000, google: 200 },
    }));
    expect(res.statusCode).toBe(200);
    const horses = await listHorses(race_id);
    const own = horses.find(h => h.horse_id === horse_id);
    expect(own?.current_tokens).toBe(6200);
  });

  it('accumulates the per-model split, and it sums to current_tokens', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setupWithCliVersion();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1, components: { anthropic: 1000, openai: 5000, google: 200 },
    }));
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 2, components: { anthropic: 500, openai: 0, google: 300 },
    }));
    const horses = await listHorses(race_id);
    const own = horses.find(h => h.horse_id === horse_id)!;
    expect(own.model_tokens).toEqual({ anthropic: 1500, openai: 5000, google: 500 });
    const summed = own.model_tokens!.anthropic + own.model_tokens!.openai + own.model_tokens!.google;
    expect(summed).toBe(own.current_tokens);
  });

  it('reports the per-model split in the response, not one beat behind', async () => {
    const { join_code, horse_id, heartbeat_token } = await setupWithCliVersion();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1, components: { anthropic: 300, openai: 200, google: 100 },
    }));
    const own = JSON.parse(res.body).horses.find((h: any) => h.horse_id === horse_id);
    expect(own.model_tokens).toEqual({ anthropic: 300, openai: 200, google: 100 });
    const summed = own.model_tokens.anthropic + own.model_tokens.openai + own.model_tokens.google;
    expect(summed).toBe(own.current_tokens);
  });

  it('scores from the per-family split, not a zeroed placeholder', async () => {
    // components is load-bearing now: a per-family modifier scores from it, so
    // a beat whose split never reached the pipeline would score nothing.
    const { join_code, race_id, horse_id, heartbeat_token } = await setupWithCliVersion();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1, components: { anthropic: 700, openai: 300, google: 0 },
    }));
    const own = (await listHorses(race_id)).find(h => h.horse_id === horse_id)!;
    expect(own.current_tokens).toBe(1000);
    expect(own.scored_tokens).toBe(1000);   // no modifier active: untouched
  });

  it('accepts the component keys an un-upgraded CLI sends', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setupWithCliVersion();
    // Pre-rename CLIs key components by tool, not by model family.
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1, components: { claude: 1000, codex: 500, gemini: 200 },
    }));
    expect(res.statusCode).toBe(200);
    const own = (await listHorses(race_id)).find(h => h.horse_id === horse_id)!;
    expect(own.current_tokens).toBe(1700);
    expect(own.model_tokens).toEqual({ anthropic: 1000, openai: 500, google: 200 });
  });

  it('carries a pre-rename model_tokens map onto the family keys', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setupWithCliVersion();
    const { putHorse: _p } = await import('../../src/db/horses.js');
    const { ddb, TABLE } = await import('../../src/db/client.js');
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const { horseKey } = await import('../../src/db/keys.js');
    // A horse mid-race when the rename deployed: map exists, wrong spelling.
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: horseKey(race_id, horse_id),
      UpdateExpression: 'SET model_tokens = :old, current_tokens = :t, scored_tokens = :t',
      ExpressionAttributeValues: { ':old': { claude: 700, codex: 300, gemini: 0 }, ':t': 1000 },
    }));

    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1, components: { anthropic: 100, openai: 0, google: 0 },
    }));

    const own = (await listHorses(race_id)).find(h => h.horse_id === horse_id)!;
    // The old figures survive under their new names, and the invariant holds.
    expect(own.model_tokens).toEqual({ anthropic: 800, openai: 300, google: 0 });
    const summed = own.model_tokens!.anthropic + own.model_tokens!.openai + own.model_tokens!.google;
    expect(summed).toBe(own.current_tokens);
  });


  it('accepts a legacy bare delta, attributed to anthropic', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setupWithCliVersion();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1,
      delta: 250,
    }));
    expect(res.statusCode).toBe(200);
    const horses = await listHorses(race_id);
    const own = horses.find(h => h.horse_id === horse_id);
    expect(own?.current_tokens).toBe(250);
  });

  it('rejects a heartbeat with neither components nor a delta', async () => {
    const { join_code, horse_id, heartbeat_token } = await setupWithCliVersion();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1 }));
    expect(res.statusCode).toBe(400);
  });

  it('does not accrue XP during the warm-up window', async () => {
    // Set up a race with start_time = now (so warm-up just began).
    const user = await makeUser('WU_User');
    const horse = await makeHorse(user, 'WU_Gary', COLORS);
    const startIso = new Date().toISOString();
    const endIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const createRes: any = await createHandler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({ name: 'WU Test', start_time: startIso, end_time: endIso, tz: 'UTC' }),
    });
    const { join_code } = JSON.parse(createRes.body);
    const joinRes: any = await joinHandler({
      version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
      pathParameters: { join_code },
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({ stable_horse_id: horse.stable_horse_id }),
    });
    const { horse_id: hid, heartbeat_token: hbt } = JSON.parse(joinRes.body);
    // Big token jump that would normally trigger Stampede!
    await hbHandler(hbEvent(join_code, hid, hbt, { seq: 1, delta: 100 }));
    await new Promise(r => setTimeout(r, 5));
    const res: any = await hbHandler(hbEvent(join_code, hid, hbt, { seq: 2, delta: 99_000 }));
    const body = JSON.parse(res.body);
    const own = body.horses.find((h: any) => h.horse_id === hid);
    expect(own.live_xp ?? 0).toBe(0);
    expect(own.recent_events ?? []).toEqual([]);
  });

  // --- stamina ---

  it('tires a horse on a stamina race and scores its later output lower', async () => {
    const { join_code, horse_id, token, race_id } = await setupLiveRaceWithHorse({ stamina: true });

    vi.useFakeTimers();
    // Twenty minutes of flat-out pace: 400,000/min is 10x sustainable, so drain
    // clamps at 6/min and the horse is well past the taper floor by the end.
    let body: Record<string, any> = {};
    for (let seq = 1; seq <= 20; seq++) {
      body = await heartbeat({ join_code, horse_id, token, seq, delta: 400_000, advanceMs: 60_000 });
    }

    const [horse] = await listHorses(race_id);
    expect(staminaOf(horse!)).toBeLessThan(25);
    expect(horse!.scored_tokens!).toBeLessThan(horse!.current_tokens);

    const ownInResponse = body.horses.find((h: any) => h.horse_id === horse_id);
    expect(ownInResponse.modifier_states).toEqual(horse!.modifier_states);
  });

  it('keeps tiring a race created before the settings map', async () => {
    const { join_code, horse_id, token, race_id } = await setupLiveRaceWithHorse({ stamina: true, legacy: true });

    vi.useFakeTimers();
    for (let seq = 1; seq <= 20; seq++) {
      await heartbeat({ join_code, horse_id, token, seq, delta: 400_000, advanceMs: 60_000 });
    }

    const [horse] = await listHorses(race_id);
    expect(staminaOf(horse!)).toBeLessThan(25);
    expect(horse!.scored_tokens!).toBeLessThan(horse!.current_tokens);
  });

  it('resumes from a pre-map row\'s flat stamina rather than restarting at full', async () => {
    const { join_code, horse_id, token, race_id } = await setupLiveRaceWithHorse({ stamina: true });
    // A horse mid-race when this release deployed: tired, but only the flat
    // attribute the previous release wrote. It must keep draining from there.
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: horseKey(race_id, horse_id),
      UpdateExpression: 'SET stamina = :s',
      ExpressionAttributeValues: { ':s': 30 },
    }));

    vi.useFakeTimers();
    const body = await heartbeat({ join_code, horse_id, token, seq: 1, delta: 400_000, advanceMs: 60_000 });

    const [horse] = await listHorses(race_id);
    // Drain clamps at 6/min, so one flat-out minute from 30 lands at ~24 --
    // reachable only by resuming from 30, never from a reset to 100.
    expect(staminaOf(horse!)).toBeCloseTo(24, 1);
    const own = body.horses.find((h: any) => h.horse_id === horse_id);
    expect(staminaOf(own)).toBeCloseTo(24, 1);
  });
});
