# Token Derby — Plan 3: Site

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public spectator site at `https://token-derby.mauricode.co.uk/` — a home page that accepts a join code and a race view (`/race/<join_code>`) that polls the API every 3s and renders horses moving across a pixel-art stadium through pending/live/finished states.

**Architecture:** Single `index.html` served from the S3 bucket that Plan 1 already provisioned; CloudFront's 403/404 → `/index.html` rewrite handles `/race/<code>` as a virtual route. Plain HTML + one bundled JS file (no framework). Horse sprite rendered as inline SVG with per-horse CSS custom properties for the four color slots. State reconciled diff-style: horse DOM nodes are created once at join, then updated with new `left` %, tokens, rank, and crashed class on each 3s poll — the DOM is never re-created.

**Tech Stack:** TypeScript 5.6+, tsup (esbuild bundling to one `main.js`), vitest 2 + happy-dom for DOM tests, plain CSS. Site deployed via the existing CDK stack — the `BucketDeployment` is re-pointed from `infra/site-placeholder/` to the built `site/dist/`.

**Spec:** `docs/superpowers/specs/2026-04-21-token-derby-design.md`
**Predecessors:** Plan 1 (foundations, API, infra) and Plan 2 (CLI) are merged to main.

---

## File structure this plan creates

```
token_derby/
├── package.json                          # MODIFIED: add "site" to workspaces
├── site/
│   ├── package.json                      # @token-derby/site (private)
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   ├── vitest.config.ts
│   ├── public/
│   │   ├── index.html                    # single HTML entrypoint
│   │   ├── styles.css                    # all styles + animations
│   │   └── favicon.svg                   # tiny horse-head favicon
│   ├── src/
│   │   ├── main.ts                       # entry: router + boot
│   │   ├── route.ts                      # parseRoute(pathname) (pure)
│   │   ├── api.ts                        # fetchRace(code) → GetRaceResponse
│   │   ├── position.ts                   # position math (pure)
│   │   ├── sprite-grid.ts                # 32×24 grid reused across horses
│   │   ├── sprite-svg.ts                 # grid → SVG element (per-horse colors)
│   │   ├── poll.ts                       # 3s polling loop with abort
│   │   ├── time.ts                       # duration formatters (pure)
│   │   └── render/
│   │       ├── home.ts                   # renders home page
│   │       ├── race.ts                   # orchestrates race view
│   │       ├── reconcile.ts              # diff horses against DOM
│   │       ├── pending.ts                # pending-state extras (countdown)
│   │       └── finished.ts               # finished-state extras (podium, confetti)
│   └── test/
│       ├── route.test.ts
│       ├── position.test.ts
│       ├── time.test.ts
│       ├── api.test.ts
│       ├── poll.test.ts
│       └── reconcile.test.ts
└── infra/
    └── lib/token-derby-stack.ts          # MODIFIED: deploy site/dist/
```

`infra/site-placeholder/` stays on disk but is no longer referenced after Task 14. It can be deleted later; not part of this plan.

---

## Task 1: Scaffold site workspace

**Files:**
- Modify: `package.json` (root) — add `site` to workspaces
- Create: `site/package.json`
- Create: `site/tsconfig.json`
- Create: `site/tsup.config.ts`
- Create: `site/vitest.config.ts`

- [ ] **Step 1: Add `site` to root workspaces**

Modify `/Users/omauri/personal_projects/token_derby/package.json` — change `"workspaces"` to:

```json
"workspaces": ["shared", "api", "infra", "cli", "site"],
```

- [ ] **Step 2: Write site/package.json**

Create `/Users/omauri/personal_projects/token_derby/site/package.json`:

```json
{
  "name": "@token-derby/site",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "prebuild": "npm run build --workspace=@token-derby/shared",
    "build": "tsup && node scripts/copy-public.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "npx serve dist"
  },
  "devDependencies": {
    "@token-derby/shared": "*",
    "@types/node": "^22.7.0",
    "happy-dom": "^15.7.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write site/tsconfig.json**

Create `/Users/omauri/personal_projects/token_derby/site/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*", "tsup.config.ts", "vitest.config.ts", "scripts/**/*"]
}
```

- [ ] **Step 4: Write site/tsup.config.ts**

Create `/Users/omauri/personal_projects/token_derby/site/tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'src/main.ts' },
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  platform: 'browser',
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: ['@token-derby/shared'],
  minify: false,
});
```

Browser target (not node); `noExternal` inlines the workspace types package so the bundle has no workspace references.

- [ ] **Step 5: Write site/vitest.config.ts**

Create `/Users/omauri/personal_projects/token_derby/site/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10_000,
    environment: 'happy-dom',
  },
});
```

- [ ] **Step 6: Write the public-files copy script**

Create `/Users/omauri/personal_projects/token_derby/site/scripts/copy-public.mjs`:

```javascript
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', 'public');
const dst = path.resolve(here, '..', 'dist');

await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`copied public/* → ${dst}`);
```

- [ ] **Step 7: Install**

```bash
cd /Users/omauri/personal_projects/token_derby
npm install
```

Expected: installs tsup, happy-dom, etc. `npm ls @token-derby/site --workspaces --depth=0` shows the new workspace.

- [ ] **Step 8: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add package.json package-lock.json site/package.json site/tsconfig.json site/tsup.config.ts site/vitest.config.ts site/scripts/copy-public.mjs
git commit -m "chore(site): scaffold @token-derby/site workspace"
```

---

## Task 2: Route parsing with TDD

**Files:**
- Create: `site/test/route.test.ts`
- Create: `site/src/route.ts`

The router is a pure function mapping `window.location.pathname` to a typed route.

- [ ] **Step 1: Write the failing test**

Create `/Users/omauri/personal_projects/token_derby/site/test/route.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseRoute } from '../src/route.js';

describe('parseRoute', () => {
  it('maps "/" to home', () => {
    expect(parseRoute('/')).toEqual({ type: 'home' });
  });

  it('maps "" to home', () => {
    expect(parseRoute('')).toEqual({ type: 'home' });
  });

  it('maps "/race/ABC123" to race with upper-case code', () => {
    expect(parseRoute('/race/ABC123')).toEqual({ type: 'race', joinCode: 'ABC123' });
  });

  it('upper-cases lower-case race codes from the URL', () => {
    expect(parseRoute('/race/abc123')).toEqual({ type: 'race', joinCode: 'ABC123' });
  });

  it('strips a trailing slash', () => {
    expect(parseRoute('/race/ABC123/')).toEqual({ type: 'race', joinCode: 'ABC123' });
  });

  it('returns not-found for unknown paths', () => {
    expect(parseRoute('/foo')).toEqual({ type: 'not-found' });
    expect(parseRoute('/race/')).toEqual({ type: 'not-found' });
    expect(parseRoute('/race/ABC/extra')).toEqual({ type: 'not-found' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/omauri/personal_projects/token_derby/site
npx vitest run test/route.test.ts
```

Expected: FAIL with "Cannot find module '../src/route.js'".

- [ ] **Step 3: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/route.ts`:

```typescript
export type Route =
  | { type: 'home' }
  | { type: 'race'; joinCode: string }
  | { type: 'not-found' };

export function parseRoute(pathname: string): Route {
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '/') return { type: 'home' };

  const match = trimmed.match(/^\/race\/([A-Za-z0-9]+)$/);
  if (match) return { type: 'race', joinCode: match[1]!.toUpperCase() };

  return { type: 'not-found' };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run test/route.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/route.ts site/test/route.test.ts
git commit -m "feat(site): route parser (pathname -> home/race/not-found)"
```

---

## Task 3: Position math with TDD

**Files:**
- Create: `site/test/position.test.ts`
- Create: `site/src/position.ts`

Implements the exact formula from the spec:
```
elapsed_pct   = clamp((now - start_time) / (end_time - start_time), 0, 1)
leader_tokens = max(horse.current_tokens for horse in horses) or 1
horse_x_pct   = (horse.current_tokens / leader_tokens) * elapsed_pct * 100
```

- [ ] **Step 1: Write the failing tests**

Create `/Users/omauri/personal_projects/token_derby/site/test/position.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { elapsedPct, leaderTokens, horseXPct } from '../src/position.js';
import type { HorseView } from '@token-derby/shared';

const start = '2026-04-22T09:00:00Z';
const end = '2026-04-22T17:00:00Z';  // 8 hours later

function h(current_tokens: number, extras: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: 'h',
    name: 'x',
    colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
    current_tokens,
    last_heartbeat: start,
    joined_at: start,
    rank: 1,
    crashed: false,
    ...extras,
  };
}

describe('elapsedPct', () => {
  it('returns 0 before start', () => {
    expect(elapsedPct(start, end, new Date('2026-04-22T08:00:00Z'))).toBe(0);
  });

  it('returns 0.5 at midpoint', () => {
    expect(elapsedPct(start, end, new Date('2026-04-22T13:00:00Z'))).toBe(0.5);
  });

  it('returns 1 at end', () => {
    expect(elapsedPct(start, end, new Date('2026-04-22T17:00:00Z'))).toBe(1);
  });

  it('clamps to 1 after end', () => {
    expect(elapsedPct(start, end, new Date('2026-04-23T00:00:00Z'))).toBe(1);
  });

  it('returns 0 when end_time <= start_time', () => {
    expect(elapsedPct(end, start, new Date('2026-04-22T13:00:00Z'))).toBe(0);
  });
});

describe('leaderTokens', () => {
  it('returns the max current_tokens across horses', () => {
    expect(leaderTokens([h(100), h(500), h(200)])).toBe(500);
  });

  it('returns 1 when all horses are at 0', () => {
    expect(leaderTokens([h(0), h(0)])).toBe(1);
  });

  it('returns 1 for an empty list', () => {
    expect(leaderTokens([])).toBe(1);
  });
});

describe('horseXPct', () => {
  const horses = [h(1000), h(500)];

  it('leader sits at exactly elapsed_pct × 100%', () => {
    expect(horseXPct(horses[0]!, horses, 0.5)).toBe(50);
  });

  it('trailing horse is proportional to leader', () => {
    // half the tokens of leader, at 50% elapsed → 25%
    expect(horseXPct(horses[1]!, horses, 0.5)).toBe(25);
  });

  it('horse with 0 tokens stays at 0%', () => {
    expect(horseXPct(h(0), [h(0), h(1000)], 0.5)).toBe(0);
  });

  it('at elapsed_pct=0 everyone is at 0%', () => {
    expect(horseXPct(horses[0]!, horses, 0)).toBe(0);
  });

  it('at elapsed_pct=1 leader is at 100%', () => {
    expect(horseXPct(horses[0]!, horses, 1)).toBe(100);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/position.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/position.ts`:

```typescript
import type { HorseView } from '@token-derby/shared';

export function elapsedPct(start_time: string, end_time: string, now: Date): number {
  const s = new Date(start_time).getTime();
  const e = new Date(end_time).getTime();
  if (e <= s) return 0;
  const raw = (now.getTime() - s) / (e - s);
  return Math.max(0, Math.min(1, raw));
}

export function leaderTokens(horses: readonly HorseView[]): number {
  let max = 0;
  for (const h of horses) {
    if (h.current_tokens > max) max = h.current_tokens;
  }
  return max || 1;
}

export function horseXPct(
  horse: HorseView,
  horses: readonly HorseView[],
  elapsed: number,
): number {
  const leader = leaderTokens(horses);
  return (horse.current_tokens / leader) * elapsed * 100;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/position.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/position.ts site/test/position.test.ts
git commit -m "feat(site): position math (elapsed_pct, leader_tokens, horse_x_pct)"
```

---

## Task 4: Duration formatters with TDD

**Files:**
- Create: `site/test/time.test.ts`
- Create: `site/src/time.ts`

Used for the countdown banner (pending) and time-left display (live).

- [ ] **Step 1: Write the failing tests**

Create `/Users/omauri/personal_projects/token_derby/site/test/time.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatDuration, countdownSeconds } from '../src/time.js';

describe('formatDuration', () => {
  it('zero seconds', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });

  it('under a minute', () => {
    expect(formatDuration(45)).toBe('00:00:45');
  });

  it('minutes and seconds', () => {
    expect(formatDuration(90)).toBe('00:01:30');
  });

  it('hours + minutes + seconds', () => {
    expect(formatDuration(3661)).toBe('01:01:01');
  });

  it('clamps negative durations to zero', () => {
    expect(formatDuration(-30)).toBe('00:00:00');
  });
});

describe('countdownSeconds', () => {
  it('returns positive when start_time is in the future', () => {
    const now = new Date('2026-04-22T08:59:30Z');
    expect(countdownSeconds('2026-04-22T09:00:00Z', now)).toBe(30);
  });

  it('returns 0 when start_time has passed', () => {
    const now = new Date('2026-04-22T09:01:00Z');
    expect(countdownSeconds('2026-04-22T09:00:00Z', now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/time.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/time.ts`:

```typescript
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(ss)}`;
}

export function countdownSeconds(start_time: string, now: Date): number {
  const delta = Math.floor((new Date(start_time).getTime() - now.getTime()) / 1000);
  return Math.max(0, delta);
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/time.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/time.ts site/test/time.test.ts
git commit -m "feat(site): duration + countdown formatters"
```

---

## Task 5: API client with TDD

**Files:**
- Create: `site/test/api.test.ts`
- Create: `site/src/api.ts`

The site hits `GET /api/races/:join_code` via relative URL (same-origin CloudFront). Tests inject a mock fetch.

- [ ] **Step 1: Write the failing tests**

Create `/Users/omauri/personal_projects/token_derby/site/test/api.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { fetchRace, ApiError } from '../src/api.js';

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  });
}

describe('fetchRace', () => {
  it('GETs /api/races/<code> and returns parsed JSON', async () => {
    const body = { race_id: 'r', join_code: 'ABC123', status: 'live', horses: [] };
    const fetch = fakeFetch(200, body);
    const race = await fetchRace('ABC123', fetch as any);
    expect(race.race_id).toBe('r');
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/races/ABC123');
  });

  it('URL-encodes the join code', async () => {
    const fetch = fakeFetch(200, {});
    await fetchRace('A/B', fetch as any);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/races/A%2FB');
  });

  it('throws ApiError with code on error envelope', async () => {
    const fetch = fakeFetch(404, { code: 'RACE_NOT_FOUND', message: 'nope' });
    await expect(fetchRace('NOPE99', fetch as any)).rejects.toMatchObject({
      code: 'RACE_NOT_FOUND',
      status: 404,
    });
  });

  it('throws ApiError with NETWORK_ERROR on fetch rejection', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(fetchRace('ABC', fetch as any)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/api.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/api.ts`:

```typescript
import type { GetRaceResponse } from '@token-derby/shared';

export type ApiErrorCode =
  | 'RACE_NOT_FOUND'
  | 'RACE_FULL'
  | 'RACE_FINISHED'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchFn = typeof fetch;

export async function fetchRace(
  joinCode: string,
  fetchImpl: FetchFn = fetch,
): Promise<GetRaceResponse> {
  const url = `/api/races/${encodeURIComponent(joinCode)}`;
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await fetchImpl(url);
  } catch (e: any) {
    throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0);
  }
  const text = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  let parsed: any = null;
  if (contentType.includes('application/json') && text.length > 0) {
    try { parsed = JSON.parse(text); } catch { parsed = null; }
  }
  if (!res.ok) {
    if (parsed && typeof parsed.code === 'string') {
      throw new ApiError(parsed.code as ApiErrorCode, parsed.message ?? 'API error', res.status);
    }
    throw new ApiError('NETWORK_ERROR', `HTTP ${res.status}`, res.status);
  }
  return parsed as GetRaceResponse;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/api.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/api.ts site/test/api.test.ts
git commit -m "feat(site): fetchRace API wrapper + ApiError"
```

---

## Task 6: Poll loop with TDD

**Files:**
- Create: `site/test/poll.test.ts`
- Create: `site/src/poll.ts`

3-second polling loop with abort support. Errors don't stop the loop — the last known state stays on screen.

- [ ] **Step 1: Write the failing tests**

Create `/Users/omauri/personal_projects/token_derby/site/test/poll.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPollLoop, type PollLoopOptions } from '../src/poll.js';
import type { GetRaceResponse } from '@token-derby/shared';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const sample: GetRaceResponse = {
  race_id: 'r1', name: 'X', start_time: 's', end_time: 'e', tz: 'UTC',
  max_participants: 30, join_code: 'JC1234', created_at: 'c',
  status: 'live', horses: [], server_time: 'now', time_left_seconds: 100,
};

function makeOpts(overrides: Partial<PollLoopOptions> = {}): PollLoopOptions {
  return {
    fetchRace: vi.fn().mockResolvedValue(sample),
    intervalMs: 3_000,
    onSnapshot: vi.fn(),
    onError: vi.fn(),
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

describe('runPollLoop', () => {
  it('immediately polls on start', async () => {
    const opts = makeOpts();
    runPollLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    expect(opts.fetchRace).toHaveBeenCalledOnce();
    expect(opts.onSnapshot).toHaveBeenCalledWith(sample);
  });

  it('polls again after intervalMs', async () => {
    const opts = makeOpts();
    runPollLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(opts.fetchRace).toHaveBeenCalledTimes(2);
  });

  it('continues polling after an error', async () => {
    const fetchRace = vi.fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue(sample);
    const opts = makeOpts({ fetchRace });
    runPollLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    expect(opts.onError).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(opts.onSnapshot).toHaveBeenCalledWith(sample);
  });

  it('stops when abortSignal fires', async () => {
    const ctrl = new AbortController();
    const opts = makeOpts({ abortSignal: ctrl.signal });
    runPollLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(opts.fetchRace).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/poll.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/poll.ts`:

```typescript
import type { GetRaceResponse } from '@token-derby/shared';

export type PollLoopOptions = {
  fetchRace: () => Promise<GetRaceResponse>;
  intervalMs: number;
  onSnapshot: (race: GetRaceResponse) => void;
  onError: (err: unknown) => void;
  abortSignal: AbortSignal;
};

export function runPollLoop(opts: PollLoopOptions): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  opts.abortSignal.addEventListener('abort', stop, { once: true });

  const tick = async () => {
    if (stopped) return;
    try {
      const race = await opts.fetchRace();
      if (!stopped) opts.onSnapshot(race);
    } catch (err) {
      if (!stopped) opts.onError(err);
    }
    if (!stopped) timer = setTimeout(tick, opts.intervalMs);
  };

  timer = setTimeout(tick, 0);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/poll.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/poll.ts site/test/poll.test.ts
git commit -m "feat(site): 3s poll loop with abort + error tolerance"
```

---

## Task 7: Horse sprite grid + SVG renderer

**Files:**
- Create: `site/src/sprite-grid.ts`
- Create: `site/src/sprite-svg.ts`

The sprite grid is the same 32×24 data the CLI uses; inlined here so the site is self-contained. `sprite-svg.ts` converts the grid to an SVG element with per-horse CSS custom properties.

- [ ] **Step 1: Write sprite-grid.ts**

Create `/Users/omauri/personal_projects/token_derby/site/src/sprite-grid.ts`:

```typescript
export type SlotTag = 'B' | 'M' | 'T' | 'S' | 'H' | null;

// Matches cli/src/ui/sprite.ts — same visual horse in SVG form.
const ROWS: readonly string[] = [
  '................................',
  '................................',
  '..........................MMM...',
  '..........................MMM...',
  '.........................MBBEBB.',
  '.........................MBBEBB.',
  '........................MBBBBBBB',
  '........................MBBBBBBB',
  '..................MMMMMMMBBB....',
  '..................MMMMMMMBBB....',
  '....BBBBBBBBSSSSSSMMBBBBBB......',
  '...BBBBBBBBBSSSSSSMMBBBBBB......',
  '.TTBBBBBBBBBSSSSSSBBBBBBBB......',
  '.TTBBBBBBBBBSSSSSSBBBBBBBB......',
  'TTTBBBBBBBBBBBBBBBBBBBBBBB......',
  'TTTBBBBBBBBBBBBBBBBBBBBB........',
  '...BBB.BBB.....BBB.BBB..........',
  '...BBB.BBB.....BBB.BBB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '...HHH.HHH.....HHH.HHH..........',
];

export const GRID: readonly (readonly SlotTag[])[] = ROWS.map((row, y) => {
  if (row.length !== 32) throw new Error(`sprite row ${y} has length ${row.length}, expected 32`);
  return [...row].map(c => toTag(c, y));
});

function toTag(c: string, y: number): SlotTag {
  switch (c) {
    case 'B': return 'B';
    case 'M': return 'M';
    case 'T': return 'T';
    case 'S': return 'S';
    case 'H': return 'H';
    case 'E': return 'B'; // eye renders as body; the site doesn't show eye detail at this zoom
    case '.': return null;
    default: throw new Error(`unknown sprite char '${c}' at y=${y}`);
  }
}

export const SPRITE_WIDTH = 32;
export const SPRITE_HEIGHT = 24;
```

- [ ] **Step 2: Write sprite-svg.ts**

Create `/Users/omauri/personal_projects/token_derby/site/src/sprite-svg.ts`:

```typescript
import { GRID, SPRITE_WIDTH, SPRITE_HEIGHT, type SlotTag } from './sprite-grid.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const SLOT_COLOR: Record<Exclude<SlotTag, null>, string> = {
  B: 'var(--body)',
  M: 'var(--mane)',
  T: 'var(--tail)',
  S: 'var(--saddle)',
  H: '#1F1108',
};

export function buildHorseSvg(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${SPRITE_WIDTH} ${SPRITE_HEIGHT}`);
  svg.setAttribute('class', 'horse-sprite');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');

  for (let y = 0; y < GRID.length; y++) {
    for (let x = 0; x < SPRITE_WIDTH; x++) {
      const tag = GRID[y]![x]!;
      if (tag === null) continue;
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '1');
      rect.setAttribute('height', '1');
      rect.setAttribute('fill', SLOT_COLOR[tag]);
      svg.appendChild(rect);
    }
  }
  return svg;
}
```

`shape-rendering: crispEdges` prevents browser subpixel smoothing so the pixels stay sharp.

- [ ] **Step 3: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/site
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/sprite-grid.ts site/src/sprite-svg.ts
git commit -m "feat(site): horse sprite grid + SVG builder"
```

---

## Task 8: Base HTML and CSS

**Files:**
- Create: `site/public/index.html`
- Create: `site/public/styles.css`
- Create: `site/public/favicon.svg`

Single-page HTML that boots `main.js`. The CSS defines layout, horse-row styles, CSS custom properties, and all animations. The JS will populate `#app` based on the route.

- [ ] **Step 1: Write index.html**

Create `/Users/omauri/personal_projects/token_derby/site/public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Token Derby</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the favicon**

Create `/Users/omauri/personal_projects/token_derby/site/public/favicon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect width="16" height="16" fill="#1a1229"/>
  <rect x="10" y="3" width="3" height="2" fill="#000"/>
  <rect x="9" y="5" width="5" height="4" fill="#8B4513"/>
  <rect x="12" y="6" width="1" height="1" fill="#000"/>
  <rect x="4" y="9" width="10" height="3" fill="#8B4513"/>
  <rect x="5" y="12" width="2" height="3" fill="#8B4513"/>
  <rect x="11" y="12" width="2" height="3" fill="#8B4513"/>
</svg>
```

- [ ] **Step 3: Write styles.css**

Create `/Users/omauri/personal_projects/token_derby/site/public/styles.css`:

```css
:root {
  --bg: #1a1229;
  --panel: #2d1d42;
  --text: #f5e9d3;
  --muted: #a68bd8;
  --accent: #ffd166;
  --lane: #3d2856;
  --lane-alt: #362248;
  --track-gap: 4px;
  --horse-height: 56px;
  --sprite-scale: 2;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Courier New", ui-monospace, Menlo, Monaco, monospace;
  min-height: 100vh;
}

#app { min-height: 100vh; display: flex; flex-direction: column; }

/* ── Home ──────────────────────────────────────────── */

.home {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 32px;
  text-align: center;
}
.home h1 {
  font-size: clamp(2.5rem, 8vw, 4rem);
  color: var(--accent);
  letter-spacing: 0.08em;
  margin: 0;
}
.home p { color: var(--muted); margin: 0; max-width: 36ch; }
.home form { display: flex; gap: 8px; }
.home input {
  background: var(--panel);
  color: var(--text);
  border: 2px solid var(--lane);
  padding: 12px 16px;
  font: inherit;
  font-size: 1.25rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  width: 180px;
}
.home input:focus { outline: none; border-color: var(--accent); }
.home button {
  background: var(--accent);
  color: var(--bg);
  border: none;
  padding: 12px 24px;
  font: inherit;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
}
.home button:hover { filter: brightness(1.1); }

/* ── Race view ─────────────────────────────────────── */

.race {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
}
.race-header {
  padding: 16px 24px;
  border-bottom: 2px solid var(--panel);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 16px;
}
.race-header h1 { margin: 0; color: var(--accent); font-size: 1.5rem; letter-spacing: 0.05em; }
.race-header .meta { color: var(--muted); display: flex; gap: 24px; flex-wrap: wrap; }
.race-header .meta b { color: var(--text); font-weight: normal; }
.race-status { text-transform: uppercase; letter-spacing: 0.1em; }
.race-status--pending { color: var(--accent); }
.race-status--live { color: #7bed9f; }
.race-status--finished { color: #a68bd8; }

.track {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: var(--track-gap);
}

.lane {
  position: relative;
  height: var(--horse-height);
  background: var(--lane);
  border-radius: 4px;
  overflow: hidden;
}
.lane:nth-child(even) { background: var(--lane-alt); }
.lane::after {
  /* finish-line marker */
  content: "";
  position: absolute;
  right: 0; top: 0; bottom: 0;
  width: 3px;
  background: repeating-linear-gradient(
    45deg,
    var(--accent) 0 6px,
    transparent 6px 12px
  );
}
.lane-name {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.horse {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  transition: left 3s linear;
  width: calc(var(--sprite-scale) * 32px);
  height: calc(var(--sprite-scale) * 24px);
}
.horse-sprite { width: 100%; height: 100%; display: block; }
.horse-label {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--text);
  font-size: 0.7rem;
  white-space: nowrap;
  text-shadow: 0 0 4px var(--bg);
}

/* ── Pending state extras ─────────────────────────── */

.pending-banner {
  text-align: center;
  padding: 16px;
  background: var(--panel);
  border-bottom: 2px solid var(--accent);
  font-size: 1.25rem;
  color: var(--accent);
  letter-spacing: 0.1em;
}

/* ── Finished state extras ────────────────────────── */

.finished .horse { transition: left 1s ease-out, transform 1s ease-out, opacity 1s ease-out; }

.podium {
  position: fixed;
  inset: 0;
  background: rgba(26, 18, 41, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  animation: fade-in 1s ease-out forwards;
  z-index: 10;
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

.podium h2 { color: var(--accent); margin: 0; font-size: 2rem; letter-spacing: 0.1em; }
.podium ol {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: flex-end;
  gap: 16px;
}
.podium li {
  background: var(--panel);
  padding: 16px;
  border-radius: 6px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.podium li:nth-child(1) { border: 2px solid gold; transform: translateY(-16px); }
.podium li:nth-child(2) { border: 2px solid silver; }
.podium li:nth-child(3) { border: 2px solid #cd7f32; }
.podium .place { font-size: 2rem; }
.podium .name { font-weight: bold; }
.podium .tokens { color: var(--muted); }

.podium .dismiss {
  background: var(--accent);
  color: var(--bg);
  border: none;
  padding: 8px 16px;
  font: inherit;
  cursor: pointer;
}
.podium .dismiss:hover { filter: brightness(1.1); }

/* ── Confetti ─────────────────────────────────────── */

.confetti {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 5;
}
.confetti span {
  position: absolute;
  top: -20px;
  width: 8px;
  height: 12px;
  animation: fall 3s linear forwards;
}
@keyframes fall {
  to { transform: translateY(110vh) rotate(720deg); }
}

/* ── Animations ───────────────────────────────────── */

@keyframes leg-swing {
  0%, 100% { transform: translate(-50%, -50%) scaleX(1); }
  50%      { transform: translate(-50%, -52%) scaleX(1); }
}
.horse.live, .horse.pending {
  animation: leg-swing 0.4s steps(2) infinite;
}
.horse.crashed {
  animation: none;
  transform: translate(-50%, -50%) rotate(75deg);
  opacity: 0.4;
}

/* ── Error / fallback ─────────────────────────────── */

.error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px;
  text-align: center;
}
.error h2 { color: #ff6b6b; margin: 0; }
.error a { color: var(--accent); }
```

- [ ] **Step 4: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/public/index.html site/public/favicon.svg site/public/styles.css
git commit -m "feat(site): base HTML + CSS scaffold with animations"
```

---

## Task 9: DOM reconciler with TDD

**Files:**
- Create: `site/test/reconcile.test.ts`
- Create: `site/src/render/reconcile.ts`

The reconciler takes a race view + a container element and ensures the DOM lanes match. On first call it creates lanes + horses. On subsequent calls it updates `left`, `rank`, tokens, and the `crashed` class without rebuilding.

- [ ] **Step 1: Write the failing tests**

Create `/Users/omauri/personal_projects/token_derby/site/test/reconcile.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { reconcileHorses } from '../src/render/reconcile.js';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

function race(overrides: Partial<GetRaceResponse> = {}): GetRaceResponse {
  return {
    race_id: 'r1', name: 'X',
    start_time: '2026-04-22T09:00:00Z',
    end_time: '2026-04-22T17:00:00Z',
    tz: 'UTC', max_participants: 30, join_code: 'JC1234',
    created_at: 'c',
    status: 'live',
    horses: [],
    server_time: '2026-04-22T13:00:00Z',
    time_left_seconds: 14_400,
    ...overrides,
  };
}

function horse(id: string, tokens: number, name: string, joined: string, extras: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: id,
    name,
    colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
    current_tokens: tokens,
    last_heartbeat: '2026-04-22T12:59:00Z',
    joined_at: joined,
    rank: 1,
    crashed: false,
    ...extras,
  };
}

let track: HTMLDivElement;
beforeEach(() => {
  document.body.innerHTML = '';
  track = document.createElement('div');
  track.className = 'track';
  document.body.appendChild(track);
});

describe('reconcileHorses', () => {
  it('creates one lane per horse on first call', () => {
    const r = race({
      horses: [
        horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
        horse('b', 200, 'Bravo', '2026-04-22T09:01:00Z'),
      ],
    });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    const lanes = track.querySelectorAll('.lane');
    expect(lanes).toHaveLength(2);
    expect(track.querySelectorAll('.horse')).toHaveLength(2);
  });

  it('assigns lanes by join order and keeps them stable across calls', () => {
    const r1 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
      horse('b', 200, 'Bravo', '2026-04-22T09:01:00Z'),
    ] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'));

    // Second poll: Bravo overtakes Alpha in tokens; lanes should NOT swap
    const r2 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
      horse('b', 900, 'Bravo', '2026-04-22T09:01:00Z'),
    ] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'));

    const lanes = track.querySelectorAll<HTMLDivElement>('.lane');
    expect(lanes).toHaveLength(2);
    expect(lanes[0]!.querySelector('.horse-label')?.textContent).toBe('Alpha');
    expect(lanes[1]!.querySelector('.horse-label')?.textContent).toBe('Bravo');
  });

  it('updates horse left% when tokens change', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));  // 50% elapsed, leader
    const h = track.querySelector<HTMLDivElement>('.horse')!;
    expect(h.style.left).toBe('50%');
  });

  it('adds the crashed class when horse.crashed flips true', () => {
    const r1 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.horse')?.classList.contains('crashed')).toBe(false);

    const r2 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z', { crashed: true }),
    ] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.horse')?.classList.contains('crashed')).toBe(true);
  });

  it('adds new horses that joined between polls without tearing existing ones', () => {
    const r1 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'));
    const alphaFirst = track.querySelector('.horse[data-horse-id="a"]');
    expect(alphaFirst).toBeTruthy();

    const r2 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
      horse('b', 200, 'Bravo', '2026-04-22T12:58:00Z'),
    ] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelectorAll('.lane')).toHaveLength(2);
    expect(track.querySelector('.horse[data-horse-id="a"]')).toBe(alphaFirst); // same node
  });

  it('applies horse colors as CSS custom properties', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    const h = track.querySelector<HTMLDivElement>('.horse')!;
    expect(h.style.getPropertyValue('--body')).toBe('#8B4513');
    expect(h.style.getPropertyValue('--saddle')).toBe('#C0392B');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/omauri/personal_projects/token_derby/site
npx vitest run test/reconcile.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/render/reconcile.ts`:

```typescript
import type { GetRaceResponse, HorseView } from '@token-derby/shared';
import { elapsedPct, horseXPct } from '../position.js';
import { buildHorseSvg } from '../sprite-svg.js';

export function reconcileHorses(
  track: HTMLElement,
  race: GetRaceResponse,
  now: Date,
): void {
  // Lanes ordered by joined_at (stable across polls)
  const ordered = [...race.horses].sort(
    (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
  );
  const pct = elapsedPct(race.start_time, race.end_time, now);

  // Build lookup of existing lanes by horse_id
  const existing = new Map<string, HTMLElement>();
  for (const lane of track.querySelectorAll<HTMLElement>('.lane')) {
    const id = lane.dataset.horseId;
    if (id) existing.set(id, lane);
  }

  // Walk ordered list; create or update each lane
  for (let i = 0; i < ordered.length; i++) {
    const horse = ordered[i]!;
    let lane = existing.get(horse.horse_id);
    if (!lane) {
      lane = createLane(track.ownerDocument, horse);
      track.appendChild(lane);
    }
    updateLane(lane, horse, race.horses, pct);
  }
}

function createLane(doc: Document, horse: HorseView): HTMLElement {
  const lane = doc.createElement('div');
  lane.className = 'lane';
  lane.dataset.horseId = horse.horse_id;

  const label = doc.createElement('div');
  label.className = 'lane-name';
  label.textContent = horse.name;
  lane.appendChild(label);

  const wrap = doc.createElement('div');
  wrap.className = 'horse';
  wrap.dataset.horseId = horse.horse_id;
  wrap.style.setProperty('--body', horse.colors.body);
  wrap.style.setProperty('--mane', horse.colors.mane);
  wrap.style.setProperty('--tail', horse.colors.tail);
  wrap.style.setProperty('--saddle', horse.colors.saddle);

  const nameLabel = doc.createElement('span');
  nameLabel.className = 'horse-label';
  nameLabel.textContent = horse.name;
  wrap.appendChild(nameLabel);

  wrap.appendChild(buildHorseSvg(doc));
  lane.appendChild(wrap);
  return lane;
}

function updateLane(
  lane: HTMLElement,
  horse: HorseView,
  allHorses: readonly HorseView[],
  pct: number,
): void {
  const wrap = lane.querySelector<HTMLElement>('.horse')!;
  const x = horseXPct(horse, allHorses, pct);
  wrap.style.left = `${x}%`;
  wrap.classList.toggle('crashed', horse.crashed);
  wrap.classList.toggle('live', !horse.crashed && pct > 0 && pct < 1);
  wrap.classList.toggle('pending', !horse.crashed && pct === 0);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/reconcile.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/render/reconcile.ts site/test/reconcile.test.ts
git commit -m "feat(site): diff-style horse reconciler (stable lanes across polls)"
```

---

## Task 10: Home page renderer

**Files:**
- Create: `site/src/render/home.ts`

Renders the home content into `#app`: logo, race-code input, submit handler that navigates to `/race/<code>`.

- [ ] **Step 1: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/render/home.ts`:

```typescript
export function renderHome(root: HTMLElement): void {
  root.innerHTML = '';
  const section = root.ownerDocument.createElement('section');
  section.className = 'home';
  section.innerHTML = `
    <h1>🏇 TOKEN DERBY</h1>
    <p>Enter a race code to watch.</p>
    <form id="race-form" autocomplete="off">
      <input id="race-code" name="code" placeholder="ABC123" maxlength="6" pattern="[A-Za-z0-9]{6}" required>
      <button type="submit">Watch</button>
    </form>
    <p>Don't have a code? Create one with <code>token-derby create</code>.</p>
  `;
  root.appendChild(section);

  const form = section.querySelector<HTMLFormElement>('#race-form')!;
  const input = section.querySelector<HTMLInputElement>('#race-code')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      input.setCustomValidity('Race codes are exactly 6 letters/digits.');
      input.reportValidity();
      return;
    }
    window.location.assign(`/race/${code}`);
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
  input.focus();
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/site
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/render/home.ts
git commit -m "feat(site): home page renderer"
```

---

## Task 11: Pending-state overlay

**Files:**
- Create: `site/src/render/pending.ts`

Renders (and updates) the "Race starts in HH:MM:SS" countdown banner. Called on every poll during pending state.

- [ ] **Step 1: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/render/pending.ts`:

```typescript
import type { GetRaceResponse } from '@token-derby/shared';
import { countdownSeconds, formatDuration } from '../time.js';

export function ensurePendingBanner(raceEl: HTMLElement): HTMLElement {
  let banner = raceEl.querySelector<HTMLElement>('.pending-banner');
  if (!banner) {
    banner = raceEl.ownerDocument.createElement('div');
    banner.className = 'pending-banner';
    raceEl.prepend(banner);
  }
  return banner;
}

export function updatePendingBanner(raceEl: HTMLElement, race: GetRaceResponse, now: Date): void {
  const banner = ensurePendingBanner(raceEl);
  const seconds = countdownSeconds(race.start_time, now);
  banner.textContent = seconds > 0
    ? `Race starts in ${formatDuration(seconds)}`
    : 'Starting…';
}

export function removePendingBanner(raceEl: HTMLElement): void {
  raceEl.querySelector('.pending-banner')?.remove();
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/render/pending.ts
git commit -m "feat(site): pending-state countdown banner"
```

---

## Task 12: Finished-state overlay (podium + confetti)

**Files:**
- Create: `site/src/render/finished.ts`

When `status === 'finished'`, fade in a podium with top 3 and sprinkle CSS confetti. The `.dismiss` button closes the overlay so the spectator can still scroll the track.

- [ ] **Step 1: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/render/finished.ts`:

```typescript
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

const CONFETTI_COLORS = ['#ffd166', '#7bed9f', '#a68bd8', '#ff6b6b', '#4db8ff', '#ffffff'];
const CONFETTI_COUNT = 40;

export function renderFinishedOverlay(raceEl: HTMLElement, race: GetRaceResponse): void {
  // One-shot: only render once per race transition into finished
  if (raceEl.querySelector('.podium')) return;

  raceEl.classList.add('finished');
  raceEl.appendChild(buildConfetti(raceEl.ownerDocument));
  raceEl.appendChild(buildPodium(raceEl.ownerDocument, race));
}

function buildConfetti(doc: Document): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 'confetti';
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const piece = doc.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
    piece.style.animationDelay = `${(Math.random() * 2).toFixed(2)}s`;
    piece.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
    wrap.appendChild(piece);
  }
  return wrap;
}

function buildPodium(doc: Document, race: GetRaceResponse): HTMLElement {
  const sorted = [...race.horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const top: HorseView[] = sorted.slice(0, 3);

  const overlay = doc.createElement('div');
  overlay.className = 'podium';
  overlay.innerHTML = `
    <h2>🏆 Final Standings</h2>
    <ol>
      ${top.map((h, i) => `
        <li>
          <span class="place">${['🥇', '🥈', '🥉'][i]}</span>
          <span class="name">${escapeHtml(h.name)}</span>
          <span class="tokens">${(h.final_tokens ?? h.current_tokens).toLocaleString()} tokens</span>
        </li>
      `).join('')}
    </ol>
    <button class="dismiss" type="button">Dismiss</button>
  `;
  overlay.querySelector<HTMLButtonElement>('.dismiss')!.addEventListener('click', () => {
    overlay.remove();
  });
  return overlay;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/render/finished.ts
git commit -m "feat(site): finished-state podium + confetti overlay"
```

---

## Task 13: Race view orchestrator

**Files:**
- Create: `site/src/render/race.ts`

Wires header, track, pending banner, finished overlay, the reconciler, and the poll loop into one `renderRace(root, joinCode)` function.

- [ ] **Step 1: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/render/race.ts`:

```typescript
import type { GetRaceResponse } from '@token-derby/shared';
import { fetchRace, ApiError } from '../api.js';
import { runPollLoop } from '../poll.js';
import { reconcileHorses } from './reconcile.js';
import { updatePendingBanner, removePendingBanner } from './pending.js';
import { renderFinishedOverlay } from './finished.js';
import { formatDuration } from '../time.js';

const POLL_INTERVAL_MS = 3_000;

export function renderRace(root: HTMLElement, joinCode: string): () => void {
  root.innerHTML = '';

  const frame = root.ownerDocument.createElement('section');
  frame.className = 'race';
  frame.innerHTML = `
    <header class="race-header">
      <h1>🏇 <span class="race-name">Loading…</span></h1>
      <div class="meta">
        <span>Status: <b class="race-status">—</b></span>
        <span>Time left: <b class="race-time-left">—</b></span>
        <span>Join code: <b>${joinCode}</b></span>
      </div>
    </header>
    <div class="track"></div>
    <footer class="race-header"><div class="meta"><a href="/">← Home</a></div></footer>
  `;
  root.appendChild(frame);

  const track = frame.querySelector<HTMLElement>('.track')!;
  const nameEl = frame.querySelector<HTMLElement>('.race-name')!;
  const statusEl = frame.querySelector<HTMLElement>('.race-status')!;
  const timeLeftEl = frame.querySelector<HTMLElement>('.race-time-left')!;

  const ctrl = new AbortController();

  const onSnapshot = (race: GetRaceResponse) => {
    const now = new Date();
    nameEl.textContent = race.name;
    statusEl.textContent = race.status;
    statusEl.className = `race-status race-status--${race.status}`;
    timeLeftEl.textContent = formatDuration(race.time_left_seconds);

    reconcileHorses(track, race, now);

    if (race.status === 'pending') {
      updatePendingBanner(frame, race, now);
    } else {
      removePendingBanner(frame);
    }

    if (race.status === 'finished') {
      renderFinishedOverlay(frame, race);
    }
  };

  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'RACE_NOT_FOUND') {
      root.innerHTML = `
        <section class="error">
          <h2>Race not found</h2>
          <p>No race with code <b>${joinCode}</b>. <a href="/">Try another code.</a></p>
        </section>
      `;
      ctrl.abort();
    }
    // Other errors: keep last snapshot on screen, keep polling.
  };

  runPollLoop({
    fetchRace: () => fetchRace(joinCode),
    intervalMs: POLL_INTERVAL_MS,
    onSnapshot,
    onError,
    abortSignal: ctrl.signal,
  });

  return () => ctrl.abort();
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/render/race.ts
git commit -m "feat(site): race view orchestrator (header + track + poll loop)"
```

---

## Task 14: Main entry + router

**Files:**
- Create: `site/src/main.ts`

Boots the app on `DOMContentLoaded`, routes on the current pathname, and rewires on `popstate` so back/forward works. Exposes no public API — it's purely driven by side effects on `#app`.

- [ ] **Step 1: Write the implementation**

Create `/Users/omauri/personal_projects/token_derby/site/src/main.ts`:

```typescript
import { parseRoute } from './route.js';
import { renderHome } from './render/home.js';
import { renderRace } from './render/race.js';

let activeCleanup: (() => void) | null = null;

function route() {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;

  if (activeCleanup) { activeCleanup(); activeCleanup = null; }

  const r = parseRoute(window.location.pathname);
  if (r.type === 'home') {
    renderHome(root);
  } else if (r.type === 'race') {
    activeCleanup = renderRace(root, r.joinCode);
  } else {
    root.innerHTML = `
      <section class="error">
        <h2>Page not found</h2>
        <p><a href="/">Back to home</a></p>
      </section>
    `;
  }
}

window.addEventListener('popstate', route);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', route, { once: true });
} else {
  route();
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add site/src/main.ts
git commit -m "feat(site): main entry + router (DOMContentLoaded + popstate)"
```

---

## Task 15: Build + local smoke

**Files:**
- (no new files — uses `site/package.json` scripts from Task 1)

- [ ] **Step 1: Build**

```bash
cd /Users/omauri/personal_projects/token_derby/site
npm run build
ls dist/
```

Expected: `dist/main.js`, `dist/main.js.map`, `dist/index.html`, `dist/styles.css`, `dist/favicon.svg`.

- [ ] **Step 2: Serve and smoke-test home**

```bash
cd /Users/omauri/personal_projects/token_derby/site
npx serve dist &
SERVE_PID=$!
sleep 2
curl -sI http://localhost:3000/ | head -2
curl -s http://localhost:3000/ | grep -q "TOKEN DERBY" && echo "home OK" || echo "home FAIL"
curl -sI http://localhost:3000/main.js | head -2
kill $SERVE_PID 2>/dev/null
```

Expected: `HTTP/1.1 200 OK` for `/` and `/main.js`; "home OK" prints.

- [ ] **Step 3: Run the full site test suite**

```bash
cd /Users/omauri/personal_projects/token_derby/site
npx vitest run
```

Expected: all tests pass across 6 files. Tally: 6 + 13 + 7 + 4 + 4 + 6 = 40 tests.

- [ ] **Step 4: No commit — verification only.**

---

## Task 16: Point CDK stack at the real site

**Files:**
- Modify: `infra/lib/token-derby-stack.ts`

Update the BucketDeployment to source from `site/dist/` and rename the construct id to reflect the new purpose.

- [ ] **Step 1: Apply the edit**

Modify `/Users/omauri/personal_projects/token_derby/infra/lib/token-derby-stack.ts`. Replace:

```typescript
    new s3deploy.BucketDeployment(this, 'DeployPlaceholder', {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, '..', 'site-placeholder'))],
      destinationBucket: siteBucket,
    });
```

With:

```typescript
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, '..', '..', 'site', 'dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });
```

Note: `distribution` and `distributionPaths` trigger a CloudFront invalidation on deploy so the new files are served immediately instead of waiting for TTL expiry. `distribution` is the `cloudfront.Distribution` defined later in the same method — this reference is valid because CDK resolves references at synth time, not instantiation time.

- [ ] **Step 2: Synth to confirm the stack still compiles**

```bash
cd /Users/omauri/personal_projects/token_derby/infra
npx cdk synth > /dev/null && echo "synth ok"
```

Expected: `synth ok`.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add infra/lib/token-derby-stack.ts
git commit -m "feat(infra): deploy site/dist instead of placeholder (with cf invalidation)"
```

---

## Task 17: Deploy to production

- [ ] **Step 1: Ensure the site is built**

```bash
cd /Users/omauri/personal_projects/token_derby/site
npm run build
```

Expected: `dist/` populated.

- [ ] **Step 2: Deploy the stack**

```bash
cd /Users/omauri/personal_projects/token_derby/infra
npx cdk deploy --require-approval never
```

Expected: `BucketDeployment` uploads dist/ to S3, issues a CloudFront invalidation. Takes 2-4 minutes.

- [ ] **Step 3: Verify the site is live**

```bash
curl -sI https://token-derby.mauricode.co.uk/ | head -2
curl -s https://token-derby.mauricode.co.uk/ | grep -c "TOKEN DERBY"
curl -sI https://token-derby.mauricode.co.uk/main.js | head -2
```

Expected: `HTTP/2 200` for both URLs; "1" printed (TOKEN DERBY appears in the HTML).

- [ ] **Step 4: No commit — deployment only.**

---

## Task 18: End-to-end browser smoke test

- [ ] **Step 1: Create a short test race via the CLI**

```bash
token-derby create
# Race name: Site Smoke
# Start time: <now - 1 min, ISO Z>
# End time:   <now + 10 min, ISO Z>
# Time zone:  (default)
# Max participants: (default)
```

Save the `join_code` and `admin_code`.

- [ ] **Step 2: Open the race viewer**

```bash
open https://token-derby.mauricode.co.uk/race/<JOIN_CODE>
```

Expected:
- Header shows race name, status `pending` or `live`, time left counting down
- Track renders with the finish-line stripe marker on the right
- "Starts in HH:MM:SS" banner visible during pending; disappears when status flips to live

- [ ] **Step 3: Join as a horse from another terminal**

```bash
token-derby join <JOIN_CODE>
```

Pick a horse from your stable. Check in the browser:
- A new lane appears on the race page within 3 seconds
- The horse's colors match what you created in the CLI
- The horse's label shows its name
- As the CLI accrues tokens (use Claude Code elsewhere on that machine), the horse glides right every 3 seconds with a smooth `transition: left 3s linear` animation

- [ ] **Step 4: Crash the CLI horse**

In the CLI terminal running `join`, press `Ctrl+C`.

Expected: within ~120s the browser shows that horse with `opacity: 0.4` and rotated ~75° (crashed state). Position freezes at its last `horse_x_pct`.

- [ ] **Step 5: End the race**

```bash
token-derby end <ADMIN_CODE>
# Confirm y
```

Expected in browser:
- Header status flips to `finished`
- Confetti falls for ~3 seconds
- Podium overlay fades in with the top 3 horses (🥇🥈🥉)
- Dismissing the overlay reveals the final track state

- [ ] **Step 6: Verify the home page flow**

Open `https://token-derby.mauricode.co.uk/` in the browser:
- Logo + input visible
- Typing the 6-char code (any case) and pressing Enter navigates to `/race/<code>` (upper-cased)
- Typing a bad code shows the browser's `pattern` validity tooltip

- [ ] **Step 7: No commit — verification only.**

---

## Task 19: Update READMEs

**Files:**
- Modify: `README.md` (root) — point `site/` entry at the live URL
- Create: `site/README.md` — brief orientation for future devs

- [ ] **Step 1: Update root README**

Modify `/Users/omauri/personal_projects/token_derby/README.md` — replace:

```markdown
- `site/` — static race viewer (shipped in Plan 3)
```

With:

```markdown
- `site/` — static race viewer — see `site/README.md`. Live at [token-derby.mauricode.co.uk](https://token-derby.mauricode.co.uk).
```

- [ ] **Step 2: Write site/README.md**

Create `/Users/omauri/personal_projects/token_derby/site/README.md`:

```markdown
# Token Derby — Site

Static spectator site for Token Derby races. Single-page HTML + one bundled JS file, no framework. Polls `GET /api/races/:code` every 3s and reconciles horse positions diff-style into the DOM.

## Layout

- `public/` — raw HTML/CSS/favicon (copied into `dist/` by the build)
- `src/` — TypeScript modules bundled by tsup into `dist/main.js`
- `test/` — vitest + happy-dom unit tests

## Pages

- `/` — home: race-code input → `/race/<code>`
- `/race/<join_code>` — race view (pending → live → finished)

CloudFront rewrites 403/404 to `/index.html` so virtual `/race/...` paths work without server-side routing.

## Local dev

```bash
npm run build            # tsup → dist/main.js + copies public/*
npm run dev              # serves dist/ on http://localhost:3000
npm test                 # vitest
```

The site reads `/api/*` relative, so local dev needs something answering those requests. Either run the API locally (`make dynamodb-up` + local Lambda harness) or point your local site at production by proxying `/api/*` — out of scope for this README.

## Deploy

From repo root:

```bash
npm run build --workspace=@token-derby/site
cd infra && npx cdk deploy
```

The CDK stack uploads `site/dist/` to S3 and invalidates CloudFront.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add README.md site/README.md
git commit -m "docs(site): README + root entry update"
```

---

## Done — what Plan 3 produced

- `site/` workspace with TypeScript source bundled via tsup into one `main.js`
- Home page with race-code input
- Race view with three render states (pending/live/finished), driven by a 3s poll loop
- Diff-style DOM reconciliation — horse nodes created once, updated in place
- SVG horse sprite matching the CLI's pixel grid with per-horse CSS custom properties
- CSS animations: leg-swing, position transition, crash fall, confetti, podium fade-in
- CDK stack updated to deploy `site/dist/` with automatic CloudFront invalidation
- Production deployment at `https://token-derby.mauricode.co.uk/`
- Manual E2E smoke-tested end-to-end with the CLI from Plan 2
