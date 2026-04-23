# Token Derby — Plan 2: CLI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `@mauricode/token-derby` CLI to npm. It manages a local stable of horses with a pixel-art horse creator, creates and joins races against the API from Plan 1, runs a heartbeat loop driven by Claude Code transcript output tokens, and renders a live status screen during the race.

**Architecture:** New `cli/` workspace using Ink (React for the terminal) for all interactive UI. Pure modules for stable/active-race file IO, transcript parsing, baseline calculation, the API client, and the heartbeat / poll loops — all TDD'd against vitest. Ink components are thin shells over those modules; component tests use `ink-testing-library`. Build is `tsup` (esbuild) which bundles `@token-derby/shared` (workspace types) into the published artifact so the CLI is self-contained on npm.

**Tech Stack:** Node 20+, TypeScript 5.6+, Ink 5, React 18, ink-text-input 6, tsup 8, vitest 2, ink-testing-library 4. Published to npm as scoped public package `@mauricode/token-derby`.

**Spec:** `docs/superpowers/specs/2026-04-21-token-derby-design.md`
**Predecessor:** `docs/superpowers/plans/2026-04-22-token-derby-plan-1-foundations-api-infra.md` (foundations, API, infra — already merged to main)

---

## File structure this plan creates

```
token_derby/
├── package.json                          # MODIFIED: add "cli" to workspaces
└── cli/
    ├── package.json                      # @mauricode/token-derby (publishable)
    ├── tsconfig.json
    ├── tsup.config.ts
    ├── vitest.config.ts
    ├── README.md                         # appears on npm
    ├── src/
    │   ├── bin.ts                        # CLI entry — parse argv, dispatch
    │   ├── config.ts                     # API base URL, intervals, version
    │   ├── paths.ts                      # ~/.token-derby/* resolvers
    │   ├── stable/
    │   │   ├── stable.ts                 # stable.json read/upsert/remove
    │   │   └── active-race.ts            # active-races/<code>.json read/write
    │   ├── tokens/
    │   │   ├── transcripts.ts            # walk *.jsonl, sum output_tokens
    │   │   └── baseline.ts               # initial + rejoin baseline math
    │   ├── api/
    │   │   ├── client.ts                 # fetch wrapper + error envelope
    │   │   └── endpoints.ts              # createRace/getRace/joinRace/heartbeat/endRace
    │   ├── ui/
    │   │   ├── palette.ts                # 16 curated hex colors per slot
    │   │   ├── sprite.ts                 # 32×24 main sprite + 8×4 mini
    │   │   ├── sprite-render.ts          # halfblock rendering → string lines
    │   │   ├── HorseSprite.tsx           # Ink component wrapping renderer
    │   │   ├── HorseCreator.tsx          # Ink wizard
    │   │   ├── HorsePicker.tsx           # Ink picker over stable
    │   │   └── StatusScreen.tsx          # live race status TUI
    │   ├── runtime/
    │   │   ├── heartbeat-loop.ts         # 60s heartbeat with retries
    │   │   ├── poll-loop.ts              # 3s race poll
    │   │   └── run-race.ts               # orchestrates join/rejoin status loop
    │   └── commands/
    │       ├── stable-create.ts
    │       ├── stable-list.ts
    │       ├── stable-delete.ts
    │       ├── create.ts                 # race creation wizard
    │       ├── join.ts
    │       ├── rejoin.ts
    │       └── end.ts
    └── test/
        ├── stable/
        │   ├── stable.test.ts
        │   └── active-race.test.ts
        ├── tokens/
        │   ├── transcripts.test.ts
        │   └── baseline.test.ts
        ├── api/
        │   ├── client.test.ts
        │   └── endpoints.test.ts
        ├── ui/
        │   ├── sprite-render.test.ts
        │   ├── HorseCreator.test.tsx
        │   └── HorsePicker.test.tsx
        └── runtime/
            ├── heartbeat-loop.test.ts
            └── poll-loop.test.ts
```

---

## Task 1: Scaffold CLI workspace

**Files:**
- Modify: `package.json` (root) — add `cli` to workspaces
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/tsup.config.ts`
- Create: `cli/vitest.config.ts`

- [ ] **Step 1: Add `cli` to root workspaces**

Modify `/Users/omauri/personal_projects/token_derby/package.json` — change `"workspaces"` to:

```json
"workspaces": ["shared", "api", "infra", "cli"],
```

- [ ] **Step 2: Write cli/package.json**

Create `/Users/omauri/personal_projects/token_derby/cli/package.json`:

```json
{
  "name": "@mauricode/token-derby",
  "version": "0.1.0",
  "description": "Token Derby CLI — manage your stable, run horses in token races driven by Claude Code output.",
  "type": "module",
  "bin": {
    "token-derby": "./dist/bin.js"
  },
  "files": ["dist", "README.md"],
  "engines": { "node": ">=20" },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx src/bin.ts",
    "prepublishOnly": "npm run build && npm test"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "ink-text-input": "^6.0.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@token-derby/shared": "*",
    "@types/node": "^22.7.0",
    "@types/react": "^18.3.0",
    "ink-testing-library": "^4.0.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Notes: `@token-derby/shared` lives only in `devDependencies` because tsup bundles it into `dist/` (see Step 3) — the published package has no runtime reference to a private workspace.

- [ ] **Step 3: Write cli/tsup.config.ts**

Create `/Users/omauri/personal_projects/token_derby/cli/tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { bin: 'src/bin.ts' },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: ['@token-derby/shared'],
  banner: { js: '#!/usr/bin/env node' },
});
```

- [ ] **Step 4: Write cli/tsconfig.json**

Create `/Users/omauri/personal_projects/token_derby/cli/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*", "tsup.config.ts", "vitest.config.ts"]
}
```

`noEmit` is intentional — tsup handles emit. tsc is only used for type-checking.

- [ ] **Step 5: Write cli/vitest.config.ts**

Create `/Users/omauri/personal_projects/token_derby/cli/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10_000,
    environment: 'node',
  },
});
```

- [ ] **Step 6: Install**

```bash
cd /Users/omauri/personal_projects/token_derby
npm install
```

Expected: installs Ink, React, tsup, etc. with no errors. The `cli` workspace shows up in `npm ls --workspaces --depth=0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add package.json package-lock.json cli/package.json cli/tsconfig.json cli/tsup.config.ts cli/vitest.config.ts
git commit -m "chore(cli): scaffold @mauricode/token-derby workspace"
```

---

## Task 2: Config and path resolvers

**Files:**
- Create: `cli/src/config.ts`
- Create: `cli/src/paths.ts`

- [ ] **Step 1: Write cli/src/config.ts**

Create `/Users/omauri/personal_projects/token_derby/cli/src/config.ts`:

```typescript
export const DEFAULT_API_BASE = 'https://token-derby.mauricode.co.uk/api';

export function apiBase(): string {
  return process.env.TOKEN_DERBY_API_BASE ?? DEFAULT_API_BASE;
}

export const HEARTBEAT_INTERVAL_MS = 60_000;
export const POLL_INTERVAL_MS = 3_000;
export const HEARTBEAT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
```

- [ ] **Step 2: Write cli/src/paths.ts**

Create `/Users/omauri/personal_projects/token_derby/cli/src/paths.ts`:

```typescript
import * as os from 'node:os';
import * as path from 'node:path';

export function homeDir(): string {
  return process.env.TOKEN_DERBY_HOME ?? path.join(os.homedir(), '.token-derby');
}

export function stableFile(): string {
  return path.join(homeDir(), 'stable.json');
}

export function activeRaceFile(joinCode: string): string {
  return path.join(homeDir(), 'active-races', `${joinCode}.json`);
}

export function activeRacesDir(): string {
  return path.join(homeDir(), 'active-races');
}

export function claudeProjectsDir(): string {
  return process.env.TOKEN_DERBY_CLAUDE_DIR ?? path.join(os.homedir(), '.claude', 'projects');
}
```

`TOKEN_DERBY_HOME` and `TOKEN_DERBY_CLAUDE_DIR` are env hooks for tests (so we never touch the real `~/.token-derby` or `~/.claude` from a test).

- [ ] **Step 3: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/config.ts cli/src/paths.ts
git commit -m "feat(cli): config defaults and home/claude path resolvers"
```

---

## Task 3: Stable IO with TDD

**Files:**
- Create: `cli/test/stable/stable.test.ts`
- Create: `cli/src/stable/stable.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/stable/stable.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadStable,
  upsertHorse,
  removeHorse,
  findHorse,
  type StableHorse,
} from '../../src/stable/stable.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-stable-'));
  process.env.TOKEN_DERBY_HOME = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
});

const gary: StableHorse = {
  name: 'Gary',
  colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  created_at: '2026-04-23T10:00:00Z',
};

describe('stable', () => {
  it('returns empty list when no stable file exists', async () => {
    const stable = await loadStable();
    expect(stable.horses).toEqual([]);
  });

  it('upserts and persists a horse', async () => {
    await upsertHorse(gary);
    const stable = await loadStable();
    expect(stable.horses).toHaveLength(1);
    expect(stable.horses[0]?.name).toBe('Gary');
  });

  it('overwrites a horse with the same name', async () => {
    await upsertHorse(gary);
    await upsertHorse({ ...gary, colors: { ...gary.colors, body: '#FFFFFF' } });
    const stable = await loadStable();
    expect(stable.horses).toHaveLength(1);
    expect(stable.horses[0]?.colors.body).toBe('#FFFFFF');
  });

  it('finds a horse by name', async () => {
    await upsertHorse(gary);
    expect(findHorse(await loadStable(), 'Gary')?.name).toBe('Gary');
    expect(findHorse(await loadStable(), 'Nope')).toBeUndefined();
  });

  it('removes a horse by name', async () => {
    await upsertHorse(gary);
    await upsertHorse({ ...gary, name: 'Pony' });
    await removeHorse('Gary');
    const stable = await loadStable();
    expect(stable.horses.map(h => h.name)).toEqual(['Pony']);
  });

  it('removeHorse on a missing name is a no-op', async () => {
    await removeHorse('Nobody');
    const stable = await loadStable();
    expect(stable.horses).toEqual([]);
  });

  it('returns empty when stable.json is malformed (does not throw)', async () => {
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(path.join(tmp, 'stable.json'), 'not json');
    const stable = await loadStable();
    expect(stable.horses).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx vitest run test/stable/stable.test.ts
```

Expected: FAIL with "Cannot find module '../../src/stable/stable.js'".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/stable/stable.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { HorseColors } from '@token-derby/shared';
import { homeDir, stableFile } from '../paths.js';

export type StableHorse = {
  name: string;
  colors: HorseColors;
  created_at: string;
};

export type Stable = {
  horses: StableHorse[];
};

export async function loadStable(): Promise<Stable> {
  try {
    const raw = await fs.readFile(stableFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.horses)) return { horses: [] };
    return parsed as Stable;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return { horses: [] };
    if (e instanceof SyntaxError) return { horses: [] };
    throw e;
  }
}

export async function saveStable(stable: Stable): Promise<void> {
  await fs.mkdir(homeDir(), { recursive: true });
  await fs.writeFile(stableFile(), JSON.stringify(stable, null, 2) + '\n', 'utf8');
}

export async function upsertHorse(horse: StableHorse): Promise<void> {
  const stable = await loadStable();
  const idx = stable.horses.findIndex(h => h.name === horse.name);
  if (idx >= 0) stable.horses[idx] = horse;
  else stable.horses.push(horse);
  await saveStable(stable);
}

export async function removeHorse(name: string): Promise<void> {
  const stable = await loadStable();
  stable.horses = stable.horses.filter(h => h.name !== name);
  await saveStable(stable);
}

export function findHorse(stable: Stable, name: string): StableHorse | undefined {
  return stable.horses.find(h => h.name === name);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/stable/stable.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/stable/stable.ts cli/test/stable/stable.test.ts
git commit -m "feat(cli): stable.json IO (load/upsert/remove/find)"
```

---

## Task 4: Active-race IO with TDD

**Files:**
- Create: `cli/test/stable/active-race.test.ts`
- Create: `cli/src/stable/active-race.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/stable/active-race.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadActiveRace,
  saveActiveRace,
  deleteActiveRace,
  listActiveRaces,
  type ActiveRace,
} from '../../src/stable/active-race.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-active-'));
  process.env.TOKEN_DERBY_HOME = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
});

const sample: ActiveRace = {
  join_code: 'K3QP7M',
  race_id: 'r-123',
  horse_id: 'h-456',
  heartbeat_token: 't-789',
  horse_name: 'Gary',
  horse_colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
  joined_at: '2026-04-23T10:00:00Z',
  last_race_tokens: 0,
  last_heartbeat_at: '2026-04-23T10:00:00Z',
};

describe('active-race', () => {
  it('returns null when no active race file exists', async () => {
    expect(await loadActiveRace('NOPE99')).toBe(null);
  });

  it('saves and loads an active race', async () => {
    await saveActiveRace(sample);
    expect(await loadActiveRace('K3QP7M')).toEqual(sample);
  });

  it('overwrites an existing active race file', async () => {
    await saveActiveRace(sample);
    await saveActiveRace({ ...sample, last_race_tokens: 5000 });
    const loaded = await loadActiveRace('K3QP7M');
    expect(loaded?.last_race_tokens).toBe(5000);
  });

  it('deletes an active race', async () => {
    await saveActiveRace(sample);
    await deleteActiveRace('K3QP7M');
    expect(await loadActiveRace('K3QP7M')).toBe(null);
  });

  it('deleteActiveRace on a missing code is a no-op', async () => {
    await deleteActiveRace('GONE');
    expect(await loadActiveRace('GONE')).toBe(null);
  });

  it('listActiveRaces returns all join codes with active files', async () => {
    await saveActiveRace(sample);
    await saveActiveRace({ ...sample, join_code: 'OTHER1' });
    const codes = (await listActiveRaces()).sort();
    expect(codes).toEqual(['K3QP7M', 'OTHER1']);
  });

  it('listActiveRaces returns [] when the directory does not exist', async () => {
    expect(await listActiveRaces()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/stable/active-race.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/stable/active-race.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { HorseColors } from '@token-derby/shared';
import { activeRaceFile, activeRacesDir } from '../paths.js';

export type ActiveRace = {
  join_code: string;
  race_id: string;
  horse_id: string;
  heartbeat_token: string;
  horse_name: string;
  horse_colors: HorseColors;
  joined_at: string;
  last_race_tokens: number;
  last_heartbeat_at: string;
};

export async function loadActiveRace(joinCode: string): Promise<ActiveRace | null> {
  try {
    const raw = await fs.readFile(activeRaceFile(joinCode), 'utf8');
    return JSON.parse(raw) as ActiveRace;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveActiveRace(active: ActiveRace): Promise<void> {
  await fs.mkdir(activeRacesDir(), { recursive: true });
  await fs.writeFile(
    activeRaceFile(active.join_code),
    JSON.stringify(active, null, 2) + '\n',
    'utf8',
  );
}

export async function deleteActiveRace(joinCode: string): Promise<void> {
  try {
    await fs.unlink(activeRaceFile(joinCode));
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
  }
}

export async function listActiveRaces(): Promise<string[]> {
  try {
    const entries = await fs.readdir(activeRacesDir());
    return entries
      .filter(f => f.endsWith('.json'))
      .map(f => path.basename(f, '.json'));
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/stable/active-race.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/stable/active-race.ts cli/test/stable/active-race.test.ts
git commit -m "feat(cli): active-race file IO (load/save/delete/list)"
```

---

## Task 5: Transcript token reader with TDD

**Files:**
- Create: `cli/test/tokens/transcripts.test.ts`
- Create: `cli/src/tokens/transcripts.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/tokens/transcripts.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sumOutputTokens } from '../../src/tokens/transcripts.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-trans-'));
  process.env.TOKEN_DERBY_CLAUDE_DIR = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_CLAUDE_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

async function writeJsonl(rel: string, lines: object[]): Promise<void> {
  const full = path.join(tmp, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
}

describe('sumOutputTokens', () => {
  it('returns 0 when claude dir does not exist', async () => {
    process.env.TOKEN_DERBY_CLAUDE_DIR = path.join(tmp, 'does-not-exist');
    expect(await sumOutputTokens()).toBe(0);
  });

  it('returns 0 when no jsonl files exist', async () => {
    await fs.mkdir(path.join(tmp, 'projA'));
    expect(await sumOutputTokens()).toBe(0);
  });

  it('sums message.usage.output_tokens across one file', async () => {
    await writeJsonl('projA/session1.jsonl', [
      { type: 'user', message: { content: 'hi' } },
      { type: 'assistant', message: { usage: { output_tokens: 100 } } },
      { type: 'assistant', message: { usage: { output_tokens: 250 } } },
    ]);
    expect(await sumOutputTokens()).toBe(350);
  });

  it('sums across multiple files and projects', async () => {
    await writeJsonl('projA/s1.jsonl', [
      { type: 'assistant', message: { usage: { output_tokens: 100 } } },
    ]);
    await writeJsonl('projA/s2.jsonl', [
      { type: 'assistant', message: { usage: { output_tokens: 200 } } },
    ]);
    await writeJsonl('projB/s1.jsonl', [
      { type: 'assistant', message: { usage: { output_tokens: 50 } } },
    ]);
    expect(await sumOutputTokens()).toBe(350);
  });

  it('skips lines without message.usage.output_tokens', async () => {
    await writeJsonl('p/s.jsonl', [
      { type: 'system' },
      { type: 'assistant', message: { content: 'x' } }, // no usage
      { type: 'assistant', message: { usage: { input_tokens: 100 } } }, // no output_tokens
      { type: 'assistant', message: { usage: { output_tokens: 42 } } },
    ]);
    expect(await sumOutputTokens()).toBe(42);
  });

  it('tolerates malformed JSON lines (logs nothing, continues)', async () => {
    const file = path.join(tmp, 'p/s.jsonl');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, [
      JSON.stringify({ type: 'assistant', message: { usage: { output_tokens: 10 } } }),
      'not json at all',
      JSON.stringify({ type: 'assistant', message: { usage: { output_tokens: 20 } } }),
    ].join('\n'));
    expect(await sumOutputTokens()).toBe(30);
  });

  it('skips empty lines', async () => {
    const file = path.join(tmp, 'p/s.jsonl');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '\n\n' + JSON.stringify({
      type: 'assistant', message: { usage: { output_tokens: 7 } },
    }) + '\n\n');
    expect(await sumOutputTokens()).toBe(7);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/tokens/transcripts.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/tokens/transcripts.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { claudeProjectsDir } from '../paths.js';

export async function sumOutputTokens(): Promise<number> {
  const root = claudeProjectsDir();
  const files = await listJsonlFiles(root);
  let total = 0;
  for (const file of files) {
    total += await sumFile(file);
  }
  return total;
}

async function listJsonlFiles(root: string): Promise<string[]> {
  let projects: string[];
  try {
    projects = await fs.readdir(root);
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
  const out: string[] = [];
  for (const project of projects) {
    const projectDir = path.join(root, project);
    let stat;
    try {
      stat = await fs.stat(projectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const entries = await fs.readdir(projectDir);
    for (const entry of entries) {
      if (entry.endsWith('.jsonl')) out.push(path.join(projectDir, entry));
    }
  }
  return out;
}

async function sumFile(file: string): Promise<number> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return 0;
  }
  let sum = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const tokens = parsed?.message?.usage?.output_tokens;
    if (typeof tokens === 'number' && Number.isFinite(tokens)) sum += tokens;
  }
  return sum;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/tokens/transcripts.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/tokens/transcripts.ts cli/test/tokens/transcripts.test.ts
git commit -m "feat(cli): transcript output_tokens reader (~/.claude/projects/*.jsonl)"
```

---

## Task 6: Baseline calculator with TDD

**Files:**
- Create: `cli/test/tokens/baseline.test.ts`
- Create: `cli/src/tokens/baseline.ts`

The CLI tracks a `baseline` of tokens observed at the moment the horse joins (or re-joins, or the race transitions from pending to live). `current_tokens` sent to the API is always `max(0, running_total - baseline)`.

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/tokens/baseline.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  initialBaseline,
  rejoinBaseline,
  currentRaceTokens,
} from '../../src/tokens/baseline.js';

describe('initialBaseline', () => {
  it('returns the running total when status is live', () => {
    expect(initialBaseline({ runningTotal: 5000, status: 'live' })).toBe(5000);
  });

  it('returns the running total when status is pending', () => {
    // Pending uses an initial snapshot too — the loop will re-snapshot at start_time.
    expect(initialBaseline({ runningTotal: 5000, status: 'pending' })).toBe(5000);
  });
});

describe('rejoinBaseline', () => {
  it('returns runningTotal - lastRaceTokens', () => {
    expect(rejoinBaseline({ runningTotal: 12_000, lastRaceTokens: 3_000 })).toBe(9_000);
  });

  it('clamps to 0 when lastRaceTokens > runningTotal (transcript pruned)', () => {
    expect(rejoinBaseline({ runningTotal: 1_000, lastRaceTokens: 5_000 })).toBe(0);
  });
});

describe('currentRaceTokens', () => {
  it('returns runningTotal - baseline', () => {
    expect(currentRaceTokens(8_500, 5_000)).toBe(3_500);
  });

  it('clamps to 0 if baseline > runningTotal', () => {
    expect(currentRaceTokens(4_000, 5_000)).toBe(0);
  });

  it('returns 0 when status is pending (race has not started)', () => {
    // currentRaceTokens does not know status; the caller decides.
    // This test documents the simple math; pending behavior is enforced in run-race.
    expect(currentRaceTokens(8_000, 5_000)).toBe(3_000);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/tokens/baseline.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/tokens/baseline.ts`:

```typescript
import type { RaceStatus } from '@token-derby/shared';

export function initialBaseline(args: { runningTotal: number; status: RaceStatus }): number {
  return args.runningTotal;
}

export function rejoinBaseline(args: { runningTotal: number; lastRaceTokens: number }): number {
  return Math.max(0, args.runningTotal - args.lastRaceTokens);
}

export function currentRaceTokens(runningTotal: number, baseline: number): number {
  return Math.max(0, runningTotal - baseline);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/tokens/baseline.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/tokens/baseline.ts cli/test/tokens/baseline.test.ts
git commit -m "feat(cli): baseline + currentRaceTokens math"
```

---

## Task 7: Color palette and sprite data

**Files:**
- Create: `cli/src/ui/palette.ts`
- Create: `cli/src/ui/sprite.ts`

These are pure data modules — no tests; the renderer test in Task 8 covers them transitively.

- [ ] **Step 1: Write cli/src/ui/palette.ts**

Create `/Users/omauri/personal_projects/token_derby/cli/src/ui/palette.ts`:

```typescript
import type { HorseColors } from '@token-derby/shared';

export type Slot = keyof HorseColors;

export const SLOTS: readonly Slot[] = ['body', 'mane', 'tail', 'saddle'] as const;

export const PALETTES: Record<Slot, readonly string[]> = {
  body: [
    '#8B4513', '#A0522D', '#D2691E', '#CD853F', '#DEB887', '#F5DEB3',
    '#FFFFFF', '#000000', '#4A2C2A', '#5D3A1A', '#704214', '#9C5919',
    '#B87333', '#E5B783', '#F0E1C9', '#2F1B0C',
  ],
  mane: [
    '#000000', '#1C1C1C', '#2F1B0C', '#4A2C2A', '#5D3A1A', '#8B4513',
    '#FFFFFF', '#F5F5DC', '#DEB887', '#CD853F', '#FF4500', '#B22222',
    '#191970', '#4B0082', '#2E8B57', '#FFD700',
  ],
  tail: [
    '#000000', '#1C1C1C', '#2F1B0C', '#4A2C2A', '#5D3A1A', '#8B4513',
    '#FFFFFF', '#F5F5DC', '#DEB887', '#CD853F', '#FF4500', '#B22222',
    '#191970', '#4B0082', '#2E8B57', '#FFD700',
  ],
  saddle: [
    '#C0392B', '#922B21', '#7B241C', '#641E16', '#1F618D', '#21618C',
    '#1B4F72', '#0E6655', '#117A65', '#196F3D', '#7D6608', '#9A7D0A',
    '#6E2C00', '#4D5656', '#212F3D', '#000000',
  ],
};

export function nextColor(slot: Slot, current: string): string {
  const palette = PALETTES[slot];
  const idx = palette.indexOf(current);
  return palette[(idx + 1 + palette.length) % palette.length] ?? palette[0]!;
}

export function prevColor(slot: Slot, current: string): string {
  const palette = PALETTES[slot];
  const idx = palette.indexOf(current);
  if (idx < 0) return palette[0]!;
  return palette[(idx - 1 + palette.length) % palette.length]!;
}

export function defaultColors(): HorseColors {
  return {
    body: PALETTES.body[0]!,
    mane: PALETTES.mane[0]!,
    tail: PALETTES.tail[0]!,
    saddle: PALETTES.saddle[0]!,
  };
}
```

- [ ] **Step 2: Write cli/src/ui/sprite.ts**

Create `/Users/omauri/personal_projects/token_derby/cli/src/ui/sprite.ts`:

```typescript
// Pixel slot tags. `null` = transparent.
//   B = body, M = mane, T = tail, S = saddle, E = eye (fixed black), H = hoof (fixed dark)
export type SlotTag = 'B' | 'M' | 'T' | 'S' | 'E' | 'H' | null;

export const FIXED_COLORS = {
  E: '#000000',
  H: '#1F1108',
} as const;

const MAIN_ROWS: readonly string[] = [
  '................................', // 0
  '................................', // 1
  '............MMMM................', // 2
  '...........MMMMMM...............', // 3
  '..........MMMMMMMM..............', // 4
  '.........MMMBBBBBB..............', // 5
  '........MMMMBBBBBB..............', // 6
  '.......MMMMBBBBBBBE.............', // 7
  '.....MMMMBBBBBBBBB..............', // 8
  '....MBBBBBBBBBBBB...............', // 9
  '...TBBBBBBBBBBBB................', // 10
  '..TTBBBBBSSSSBBB................', // 11
  '.TTTBBBBSSSSBBB.................', // 12
  'TTTBBBBBSSSSBBB.................', // 13
  'TTBBBBBBBBBBBB..................', // 14
  '..BBBB.BB.BBBB..................', // 15
  '..BBBB.BB.BBBB..................', // 16
  '..BBBB.BB.BBBB..................', // 17
  '..BBBB.BB.BBBB..................', // 18
  '..BBBB.BB.BBBB..................', // 19
  '..BBBB.BB.BBBB..................', // 20
  '..HHHH.HH.HHHH..................', // 21
  '................................', // 22
  '................................', // 23
];

const MINI_ROWS: readonly string[] = [
  '..MMBE..',
  '.MBBBBB.',
  'TBBSSBB.',
  '.HH.HH..',
];

export const MAIN_SPRITE: readonly (readonly SlotTag[])[] = parse(MAIN_ROWS, 32, 24);
export const MINI_SPRITE: readonly (readonly SlotTag[])[] = parse(MINI_ROWS, 8, 4);

function parse(rows: readonly string[], width: number, height: number): SlotTag[][] {
  if (rows.length !== height) {
    throw new Error(`sprite has ${rows.length} rows, expected ${height}`);
  }
  return rows.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`sprite row ${y} has length ${row.length}, expected ${width}`);
    }
    return [...row].map(c => toTag(c));
  });
}

function toTag(c: string): SlotTag {
  switch (c) {
    case 'B': return 'B';
    case 'M': return 'M';
    case 'T': return 'T';
    case 'S': return 'S';
    case 'E': return 'E';
    case 'H': return 'H';
    case '.': return null;
    default: throw new Error(`unknown sprite char: ${c}`);
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors. (The sprite parser also throws at module-load time if a row is the wrong width — keeps the data honest.)

- [ ] **Step 4: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/ui/palette.ts cli/src/ui/sprite.ts
git commit -m "feat(cli): horse sprite (32x24 + 8x4 mini) and slot palettes"
```

---

## Task 8: Halfblock sprite renderer with TDD

**Files:**
- Create: `cli/test/ui/sprite-render.test.ts`
- Create: `cli/src/ui/sprite-render.ts`

The renderer turns a sprite + colors into an array of `Cell` rows where each cell holds a `top` and `bottom` hex (each cell renders as one half-block character). The Ink layer in Task 12 paints them.

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/ui/sprite-render.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderSprite, type Cell } from '../../src/ui/sprite-render.js';
import { MAIN_SPRITE, MINI_SPRITE } from '../../src/ui/sprite.js';
import { defaultColors } from '../../src/ui/palette.js';

describe('renderSprite', () => {
  it('produces height/2 rows of width cells', () => {
    const colors = defaultColors();
    const grid = renderSprite(MAIN_SPRITE, colors);
    expect(grid).toHaveLength(12);
    expect(grid[0]!).toHaveLength(32);
  });

  it('renders mini sprite as 2 rows of 8 cells', () => {
    const grid = renderSprite(MINI_SPRITE, defaultColors());
    expect(grid).toHaveLength(2);
    expect(grid[0]!).toHaveLength(8);
  });

  it('a body pixel above transparent yields top=body, bottom=null', () => {
    // Construct a tiny 2x2 sprite directly.
    const tiny = [
      ['B', null],
      [null, null],
    ] as const;
    const colors = { body: '#FF0000', mane: '#0000FF', tail: '#000', saddle: '#000' };
    const grid = renderSprite(tiny as any, colors as any);
    const cell = grid[0]![0]!;
    expect(cell.top).toBe('#FF0000');
    expect(cell.bottom).toBe(null);
  });

  it('a body pixel above a mane pixel yields top=body, bottom=mane', () => {
    const tiny = [['B'], ['M']] as const;
    const colors = { body: '#FF0000', mane: '#00FF00', tail: '#000', saddle: '#000' };
    const grid = renderSprite(tiny as any, colors as any);
    expect(grid[0]![0]).toEqual<Cell>({ top: '#FF0000', bottom: '#00FF00' });
  });

  it('uses the fixed eye color regardless of input colors', () => {
    const tiny = [['E'], [null]] as const;
    const grid = renderSprite(tiny as any, defaultColors());
    expect(grid[0]![0]?.top).toBe('#000000');
  });

  it('uses the fixed hoof color', () => {
    const tiny = [[null], ['H']] as const;
    const grid = renderSprite(tiny as any, defaultColors());
    expect(grid[0]![0]?.bottom).toBe('#1F1108');
  });

  it('ignores the bottom row of a sprite with odd height', () => {
    const tiny = [['B'], ['M'], ['T']] as const;
    const colors = { body: '#FF0000', mane: '#00FF00', tail: '#0000FF', saddle: '#000' };
    const grid = renderSprite(tiny as any, colors as any);
    expect(grid).toHaveLength(2);
    expect(grid[1]![0]).toEqual<Cell>({ top: '#0000FF', bottom: null });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/ui/sprite-render.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/ui/sprite-render.ts`:

```typescript
import type { HorseColors } from '@token-derby/shared';
import { FIXED_COLORS, type SlotTag } from './sprite.js';

export type Cell = {
  top: string | null;
  bottom: string | null;
};

export function renderSprite(
  sprite: readonly (readonly SlotTag[])[],
  colors: HorseColors,
): Cell[][] {
  const out: Cell[][] = [];
  for (let y = 0; y + 1 < sprite.length || y < sprite.length; y += 2) {
    const topRow = sprite[y];
    const bottomRow = sprite[y + 1];
    if (!topRow) break;
    const row: Cell[] = [];
    for (let x = 0; x < topRow.length; x++) {
      row.push({
        top: tagColor(topRow[x] ?? null, colors),
        bottom: tagColor(bottomRow?.[x] ?? null, colors),
      });
    }
    out.push(row);
    if (!bottomRow) break;
  }
  return out;
}

function tagColor(tag: SlotTag, colors: HorseColors): string | null {
  if (tag === null) return null;
  if (tag === 'E') return FIXED_COLORS.E;
  if (tag === 'H') return FIXED_COLORS.H;
  if (tag === 'B') return colors.body;
  if (tag === 'M') return colors.mane;
  if (tag === 'T') return colors.tail;
  if (tag === 'S') return colors.saddle;
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/ui/sprite-render.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/ui/sprite-render.ts cli/test/ui/sprite-render.test.ts
git commit -m "feat(cli): halfblock sprite renderer (sprite + colors -> cell grid)"
```

---

## Task 9: API client with TDD

**Files:**
- Create: `cli/test/api/client.test.ts`
- Create: `cli/src/api/client.ts`

The client wraps `fetch`, surfaces error envelopes as a typed `ApiError`, and lets tests inject a custom fetch.

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/api/client.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { request, ApiError } from '../../src/api/client.js';

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  });
}

describe('request', () => {
  it('returns parsed JSON on 2xx', async () => {
    const fetch = fakeFetch(200, { hello: 'world' });
    const out = await request<{ hello: string }>('GET', '/foo', undefined, undefined, fetch as any);
    expect(out).toEqual({ hello: 'world' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('throws ApiError on a JSON error envelope', async () => {
    const fetch = fakeFetch(409, { code: 'RACE_FULL', message: 'full!' });
    await expect(request('POST', '/foo', { x: 1 }, undefined, fetch as any))
      .rejects.toMatchObject({
        code: 'RACE_FULL',
        message: 'full!',
        status: 409,
      });
  });

  it('attaches Authorization header when authToken is provided', async () => {
    const fetch = fakeFetch(200, {});
    await request('POST', '/foo', { y: 2 }, 'tok-abc', fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer tok-abc');
  });

  it('omits body when undefined', async () => {
    const fetch = fakeFetch(200, {});
    await request('GET', '/foo', undefined, undefined, fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it('JSON-encodes object body and sets content-type', async () => {
    const fetch = fakeFetch(200, {});
    await request('POST', '/foo', { a: 1 }, undefined, fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('wraps non-JSON 5xx responses with NETWORK_ERROR', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => 'text/html' },
      text: async () => '<html>bad gateway</html>',
    });
    await expect(request('GET', '/foo', undefined, undefined, fetch as any))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 502 });
  });

  it('wraps fetch-thrown errors with NETWORK_ERROR', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(request('GET', '/foo', undefined, undefined, fetch as any))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringContaining('ECONNREFUSED') });
  });

  it('uses apiBase() to resolve the URL when path starts with /', async () => {
    process.env.TOKEN_DERBY_API_BASE = 'https://example.test/api';
    const fetch = fakeFetch(200, {});
    await request('GET', '/races/ABC', undefined, undefined, fetch as any);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://example.test/api/races/ABC');
    delete process.env.TOKEN_DERBY_API_BASE;
  });
});

describe('ApiError', () => {
  it('exposes code, message, and status', () => {
    const e = new ApiError('RACE_FULL', 'full!', 409);
    expect(e.code).toBe('RACE_FULL');
    expect(e.message).toBe('full!');
    expect(e.status).toBe(409);
    expect(e instanceof Error).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/api/client.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/api/client.ts`:

```typescript
import { apiBase } from '../config.js';

export type ApiErrorCode =
  | 'RACE_NOT_FOUND'
  | 'RACE_FULL'
  | 'RACE_FINISHED'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
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

export async function request<T>(
  method: string,
  path: string,
  body: unknown,
  authToken: string | undefined,
  fetchImpl: FetchFn = fetch,
): Promise<T> {
  const url = path.startsWith('http') ? path : `${apiBase()}${path}`;
  const headers: Record<string, string> = {};
  if (authToken) headers['authorization'] = `Bearer ${authToken}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0);
  }

  const text = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  let parsed: any = null;
  if (contentType.includes('application/json') && text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    if (parsed && typeof parsed.code === 'string') {
      throw new ApiError(parsed.code as ApiErrorCode, parsed.message ?? 'API error', res.status);
    }
    throw new ApiError('NETWORK_ERROR', `HTTP ${res.status}`, res.status);
  }

  return parsed as T;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/api/client.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Write API endpoint wrappers**

Create `/Users/omauri/personal_projects/token_derby/cli/src/api/endpoints.ts`:

```typescript
import type {
  CreateRaceRequest, CreateRaceResponse,
  GetRaceResponse, JoinRaceRequest, JoinRaceResponse,
  HeartbeatRequest, HeartbeatResponse, EndRaceResponse,
} from '@token-derby/shared';
import { request } from './client.js';

export function createRace(body: CreateRaceRequest) {
  return request<CreateRaceResponse>('POST', '/races', body, undefined);
}

export function getRace(joinCode: string) {
  return request<GetRaceResponse>('GET', `/races/${encodeURIComponent(joinCode)}`, undefined, undefined);
}

export function joinRace(joinCode: string, body: JoinRaceRequest) {
  return request<JoinRaceResponse>('POST', `/races/${encodeURIComponent(joinCode)}/join`, body, undefined);
}

export function heartbeat(joinCode: string, horseId: string, token: string, body: HeartbeatRequest) {
  return request<HeartbeatResponse>(
    'POST',
    `/races/${encodeURIComponent(joinCode)}/horses/${encodeURIComponent(horseId)}/heartbeat`,
    body,
    token,
  );
}

export function endRace(adminCode: string) {
  return request<EndRaceResponse>('DELETE', `/races/admin/${encodeURIComponent(adminCode)}`, undefined, undefined);
}
```

- [ ] **Step 6: Add a thin endpoint test**

Create `/Users/omauri/personal_projects/token_derby/cli/test/api/endpoints.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Patch global fetch for endpoint tests.
describe('endpoints', () => {
  it('createRace POSTs to /races', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ race_id: 'r', join_code: 'JC1234', admin_code: 'a' }),
    });
    (globalThis as any).fetch = fetch;
    const { createRace } = await import('../../src/api/endpoints.js');
    const out = await createRace({ name: 'x', start_time: 's', end_time: 'e', tz: 'UTC' });
    expect(out.join_code).toBe('JC1234');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/races$/);
  });

  it('heartbeat sends Bearer token', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ race_status: 'live', server_time: 'now', time_left_seconds: 100 }),
    });
    (globalThis as any).fetch = fetch;
    const { heartbeat } = await import('../../src/api/endpoints.js');
    await heartbeat('JC1234', 'h-1', 'tok-xyz', { current_tokens: 42 });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer tok-xyz');
  });
});
```

- [ ] **Step 7: Run all api tests**

```bash
npx vitest run test/api/
```

Expected: PASS (9 + 2 = 11 tests).

- [ ] **Step 8: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/api/ cli/test/api/
git commit -m "feat(cli): API client + typed endpoint wrappers"
```

---

## Task 10: Heartbeat loop with TDD

**Files:**
- Create: `cli/test/runtime/heartbeat-loop.test.ts`
- Create: `cli/src/runtime/heartbeat-loop.ts`

The loop sends a heartbeat at `intervalMs`. On error, it retries with the configured delay sequence (capped to the last value indefinitely). Successful heartbeats invoke `onSuccess`; failures invoke `onError` so the UI can flag warnings.

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/runtime/heartbeat-loop.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runHeartbeatLoop, type HeartbeatLoopOptions } from '../../src/runtime/heartbeat-loop.js';
import type { HeartbeatResponse } from '@token-derby/shared';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const okResp: HeartbeatResponse = { race_status: 'live', server_time: 'now', time_left_seconds: 100 };

function makeOpts(overrides: Partial<HeartbeatLoopOptions> = {}): HeartbeatLoopOptions {
  return {
    sendHeartbeat: vi.fn().mockResolvedValue(okResp),
    getCurrentTokens: vi.fn().mockReturnValue(0),
    intervalMs: 60_000,
    retryDelaysMs: [1_000, 2_000, 4_000],
    onSuccess: vi.fn(),
    onError: vi.fn(),
    onFinished: vi.fn(),
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

describe('runHeartbeatLoop', () => {
  it('sends an immediate first heartbeat', async () => {
    const opts = makeOpts();
    runHeartbeatLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    expect(opts.sendHeartbeat).toHaveBeenCalledOnce();
    expect(opts.sendHeartbeat).toHaveBeenCalledWith(0);
    expect(opts.onSuccess).toHaveBeenCalledWith(okResp);
  });

  it('sends another heartbeat after intervalMs', async () => {
    const opts = makeOpts();
    runHeartbeatLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opts.sendHeartbeat).toHaveBeenCalledTimes(2);
  });

  it('reads current tokens fresh on each tick', async () => {
    const getCurrentTokens = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(250);
    const opts = makeOpts({ getCurrentTokens });
    runHeartbeatLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opts.sendHeartbeat).toHaveBeenNthCalledWith(1, 100);
    expect(opts.sendHeartbeat).toHaveBeenNthCalledWith(2, 250);
  });

  it('retries with backoff after a failure', async () => {
    const sendHeartbeat = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('still'))
      .mockResolvedValue(okResp);
    const opts = makeOpts({ sendHeartbeat });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);          // attempt 1 fires + fails
    expect(sendHeartbeat).toHaveBeenCalledTimes(1);
    expect(opts.onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);      // retry 1 (delays[0])
    expect(sendHeartbeat).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2_000);      // retry 2 (delays[1]) succeeds
    expect(sendHeartbeat).toHaveBeenCalledTimes(3);
    expect(opts.onSuccess).toHaveBeenCalledWith(okResp);
  });

  it('caps retry delay at the last value', async () => {
    const sendHeartbeat = vi.fn().mockRejectedValue(new Error('always'));
    const opts = makeOpts({ sendHeartbeat, retryDelaysMs: [1_000, 2_000] });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sendHeartbeat).toHaveBeenCalledTimes(5);
  });

  it('after success, resumes on the normal interval rather than backoff', async () => {
    const sendHeartbeat = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(okResp);
    const opts = makeOpts({ sendHeartbeat });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);          // attempt 1 fails
    await vi.advanceTimersByTimeAsync(1_000);      // retry succeeds
    expect(sendHeartbeat).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendHeartbeat).toHaveBeenCalledTimes(3);
  });

  it('calls onFinished and stops when race_status flips to finished', async () => {
    const finishedResp: HeartbeatResponse = { ...okResp, race_status: 'finished' };
    const sendHeartbeat = vi.fn().mockResolvedValue(finishedResp);
    const opts = makeOpts({ sendHeartbeat });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);
    expect(opts.onFinished).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendHeartbeat).toHaveBeenCalledOnce();
  });

  it('stops sending after abortSignal aborts', async () => {
    const ctrl = new AbortController();
    const opts = makeOpts({ abortSignal: ctrl.signal });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);
    expect(opts.sendHeartbeat).toHaveBeenCalledOnce();

    ctrl.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opts.sendHeartbeat).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/runtime/heartbeat-loop.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/runtime/heartbeat-loop.ts`:

```typescript
import type { HeartbeatResponse } from '@token-derby/shared';

export type HeartbeatLoopOptions = {
  sendHeartbeat: (currentTokens: number) => Promise<HeartbeatResponse>;
  getCurrentTokens: () => number;
  intervalMs: number;
  retryDelaysMs: readonly number[];
  onSuccess: (resp: HeartbeatResponse) => void;
  onError: (err: unknown) => void;
  onFinished: () => void;
  abortSignal: AbortSignal;
};

export function runHeartbeatLoop(opts: HeartbeatLoopOptions): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryIndex = 0;
  let stopped = false;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  opts.abortSignal.addEventListener('abort', stop, { once: true });

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(tick, delay);
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const tokens = opts.getCurrentTokens();
      const resp = await opts.sendHeartbeat(tokens);
      retryIndex = 0;
      opts.onSuccess(resp);
      if (resp.race_status === 'finished') {
        opts.onFinished();
        stop();
        return;
      }
      schedule(opts.intervalMs);
    } catch (err) {
      opts.onError(err);
      const delay = opts.retryDelaysMs[Math.min(retryIndex, opts.retryDelaysMs.length - 1)] ?? 1_000;
      retryIndex += 1;
      schedule(delay);
    }
  };

  schedule(0);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/runtime/heartbeat-loop.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/runtime/heartbeat-loop.ts cli/test/runtime/heartbeat-loop.test.ts
git commit -m "feat(cli): heartbeat loop with backoff + finish detection"
```

---

## Task 11: Poll loop with TDD

**Files:**
- Create: `cli/test/runtime/poll-loop.test.ts`
- Create: `cli/src/runtime/poll-loop.ts`

The poll loop calls `getRace` every `intervalMs`. On success, fires `onSnapshot`. On error, fires `onError` and keeps polling at the same cadence.

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/runtime/poll-loop.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPollLoop, type PollLoopOptions } from '../../src/runtime/poll-loop.js';
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
npx vitest run test/runtime/poll-loop.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/runtime/poll-loop.ts`:

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
npx vitest run test/runtime/poll-loop.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/runtime/poll-loop.ts cli/test/runtime/poll-loop.test.ts
git commit -m "feat(cli): poll loop for GET /races every 3s"
```

---

## Task 12: HorseSprite Ink component

**Files:**
- Create: `cli/src/ui/HorseSprite.tsx`

A small, untested presentational component — covered indirectly by the Creator/Picker tests below.

- [ ] **Step 1: Write the component**

Create `/Users/omauri/personal_projects/token_derby/cli/src/ui/HorseSprite.tsx`:

```typescript
import React from 'react';
import { Box, Text } from 'ink';
import type { HorseColors } from '@token-derby/shared';
import { renderSprite } from './sprite-render.js';
import type { SlotTag } from './sprite.js';

type Props = {
  sprite: readonly (readonly SlotTag[])[];
  colors: HorseColors;
};

export function HorseSprite({ sprite, colors }: Props) {
  const grid = renderSprite(sprite, colors);
  return (
    <Box flexDirection="column">
      {grid.map((row, y) => (
        <Text key={y}>
          {row.map((cell, x) => {
            // Half-block: ▀ has fg=top, bg=bottom. If both null, render space.
            // If only top, ▀ fg=top, no bg. If only bottom, ▄ fg=bottom.
            if (cell.top === null && cell.bottom === null) return ' ';
            if (cell.top !== null && cell.bottom !== null) {
              return (
                <Text key={x} color={cell.top} backgroundColor={cell.bottom}>
                  ▀
                </Text>
              );
            }
            if (cell.top !== null) {
              return (
                <Text key={x} color={cell.top}>
                  ▀
                </Text>
              );
            }
            return (
              <Text key={x} color={cell.bottom!}>
                ▄
              </Text>
            );
          })}
        </Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/ui/HorseSprite.tsx
git commit -m "feat(cli): HorseSprite Ink component (halfblock + 24-bit color)"
```

---

## Task 13: HorseCreator Ink wizard with TDD

**Files:**
- Create: `cli/test/ui/HorseCreator.test.tsx`
- Create: `cli/src/ui/HorseCreator.tsx`

The Creator is a controlled state machine: the parent provides `onSubmit(name, colors)` or `onCancel()`. Internal state: selected slot index, colors map, naming-mode flag, name buffer. Tests drive it via `ink-testing-library`.

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/ui/HorseCreator.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HorseCreator } from '../../src/ui/HorseCreator.js';
import { defaultColors, PALETTES } from '../../src/ui/palette.js';

describe('HorseCreator', () => {
  it('renders the four slot rows with the body slot selected', () => {
    const { lastFrame } = render(<HorseCreator onSubmit={() => {}} onCancel={() => {}} />);
    const out = lastFrame();
    expect(out).toContain('body');
    expect(out).toContain('mane');
    expect(out).toContain('tail');
    expect(out).toContain('saddle');
    // Selection indicator on body
    expect(out).toMatch(/►\s*body/);
  });

  it('Down arrow moves selection to the next slot', () => {
    const { lastFrame, stdin } = render(<HorseCreator onSubmit={() => {}} onCancel={() => {}} />);
    stdin.write('[B'); // down arrow
    expect(lastFrame()).toMatch(/►\s*mane/);
  });

  it('Up arrow at the top wraps to saddle', () => {
    const { lastFrame, stdin } = render(<HorseCreator onSubmit={() => {}} onCancel={() => {}} />);
    stdin.write('[A'); // up
    expect(lastFrame()).toMatch(/►\s*saddle/);
  });

  it('Right arrow advances the selected slot to the next palette color', () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<HorseCreator onSubmit={onSubmit} onCancel={() => {}} />);
    stdin.write('[C'); // right — body advances
    stdin.write('\r');       // enter — go to name prompt
    stdin.write('Gary');
    stdin.write('\r');       // submit
    expect(onSubmit).toHaveBeenCalledOnce();
    const [name, colors] = onSubmit.mock.calls[0]!;
    expect(name).toBe('Gary');
    expect(colors.body).toBe(PALETTES.body[1]);
    expect(colors.mane).toBe(defaultColors().mane);
  });

  it('Left arrow at index 0 wraps to the last palette entry', () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<HorseCreator onSubmit={onSubmit} onCancel={() => {}} />);
    stdin.write('[D'); // left
    stdin.write('\r');
    stdin.write('X');
    stdin.write('\r');
    const [, colors] = onSubmit.mock.calls[0]!;
    expect(colors.body).toBe(PALETTES.body[PALETTES.body.length - 1]);
  });

  it('Esc cancels without submitting', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(<HorseCreator onSubmit={onSubmit} onCancel={onCancel} />);
    stdin.write(''); // ESC
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('seeds with provided initial values when given', () => {
    const initial = { ...defaultColors(), body: PALETTES.body[3]! };
    const onSubmit = vi.fn();
    const { stdin } = render(
      <HorseCreator onSubmit={onSubmit} onCancel={() => {}} initialColors={initial} initialName="Pony" />,
    );
    stdin.write('\r');     // accept
    stdin.write('\r');     // submit name (already filled)
    expect(onSubmit).toHaveBeenCalledWith('Pony', initial);
  });

  it('rejects empty name on submit', () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(<HorseCreator onSubmit={onSubmit} onCancel={() => {}} />);
    stdin.write('\r');      // accept colors
    stdin.write('\r');      // submit empty
    expect(onSubmit).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('Name required');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/ui/HorseCreator.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/ui/HorseCreator.tsx`:

```typescript
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { HorseColors } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { MAIN_SPRITE } from './sprite.js';
import { SLOTS, PALETTES, nextColor, prevColor, defaultColors, type Slot } from './palette.js';

type Props = {
  onSubmit: (name: string, colors: HorseColors) => void;
  onCancel: () => void;
  initialColors?: HorseColors;
  initialName?: string;
};

export function HorseCreator({ onSubmit, onCancel, initialColors, initialName }: Props) {
  const [colors, setColors] = useState<HorseColors>(initialColors ?? defaultColors());
  const [slotIdx, setSlotIdx] = useState(0);
  const [namingMode, setNamingMode] = useState(false);
  const [name, setName] = useState(initialName ?? '');
  const [error, setError] = useState<string | null>(null);

  const slot: Slot = SLOTS[slotIdx]!;

  useInput((input, key) => {
    if (namingMode) return;
    if (key.escape) { onCancel(); return; }
    if (key.upArrow) { setSlotIdx((slotIdx - 1 + SLOTS.length) % SLOTS.length); return; }
    if (key.downArrow) { setSlotIdx((slotIdx + 1) % SLOTS.length); return; }
    if (key.leftArrow) { setColors({ ...colors, [slot]: prevColor(slot, colors[slot]) }); return; }
    if (key.rightArrow) { setColors({ ...colors, [slot]: nextColor(slot, colors[slot]) }); return; }
    if (key.return) { setNamingMode(true); return; }
  });

  const handleNameSubmit = (value: string) => {
    if (!value.trim()) {
      setError('Name required');
      return;
    }
    onSubmit(value.trim(), colors);
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <HorseSprite sprite={MAIN_SPRITE} colors={colors} />
      </Box>

      <Box flexDirection="column">
        {SLOTS.map((s, i) => (
          <Text key={s}>
            {i === slotIdx ? '►' : ' '} {s.padEnd(7)} <Text color={colors[s]}>██</Text> {colors[s]}
          </Text>
        ))}
      </Box>

      {!namingMode && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>↑/↓ select slot · ←/→ cycle color · Enter accept · Esc cancel</Text>
        </Box>
      )}

      {namingMode && (
        <Box marginTop={1} flexDirection="column">
          <Text>Name your horse: </Text>
          <TextInput value={name} onChange={(v) => { setName(v); setError(null); }} onSubmit={handleNameSubmit} />
          {error && <Text color="red">{error}</Text>}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/ui/HorseCreator.test.tsx
```

Expected: PASS, 8 tests. If a key-event test is flaky because Ink batches frames, add `await new Promise(r => setImmediate(r));` after `stdin.write` and before the assertion.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/ui/HorseCreator.tsx cli/test/ui/HorseCreator.test.tsx
git commit -m "feat(cli): HorseCreator Ink wizard (slot/color/name)"
```

---

## Task 14: HorsePicker Ink component with TDD

**Files:**
- Create: `cli/test/ui/HorsePicker.test.tsx`
- Create: `cli/src/ui/HorsePicker.tsx`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/cli/test/ui/HorsePicker.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HorsePicker } from '../../src/ui/HorsePicker.js';
import type { StableHorse } from '../../src/stable/stable.js';

const stable: StableHorse[] = [
  { name: 'Gary', colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' }, created_at: '2026-01-01T00:00:00Z' },
  { name: 'Pony', colors: { body: '#FFFFFF', mane: '#000', tail: '#000', saddle: '#1B4F72' }, created_at: '2026-01-02T00:00:00Z' },
  { name: 'Dash', colors: { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' }, created_at: '2026-01-03T00:00:00Z' },
];

describe('HorsePicker', () => {
  it('renders all horses with first highlighted', () => {
    const { lastFrame } = render(<HorsePicker horses={stable} onPick={() => {}} onCancel={() => {}} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Gary');
    expect(frame).toContain('Pony');
    expect(frame).toContain('Dash');
    expect(frame).toMatch(/►\s*Gary/);
  });

  it('Down arrow moves highlight', () => {
    const { lastFrame, stdin } = render(<HorsePicker horses={stable} onPick={() => {}} onCancel={() => {}} />);
    stdin.write('[B');
    expect(lastFrame()).toMatch(/►\s*Pony/);
  });

  it('Enter calls onPick with the highlighted horse', () => {
    const onPick = vi.fn();
    const { stdin } = render(<HorsePicker horses={stable} onPick={onPick} onCancel={() => {}} />);
    stdin.write('[B'); // Pony
    stdin.write('\r');
    expect(onPick).toHaveBeenCalledWith(stable[1]);
  });

  it('Esc calls onCancel', () => {
    const onCancel = vi.fn();
    const { stdin } = render(<HorsePicker horses={stable} onPick={() => {}} onCancel={onCancel} />);
    stdin.write('');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders empty-state message when stable is empty', () => {
    const { lastFrame } = render(<HorsePicker horses={[]} onPick={() => {}} onCancel={() => {}} />);
    expect(lastFrame()).toContain('No horses in your stable');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/ui/HorsePicker.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/cli/src/ui/HorsePicker.tsx`:

```typescript
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { HorseSprite } from './HorseSprite.js';
import { MINI_SPRITE } from './sprite.js';
import type { StableHorse } from '../stable/stable.js';

type Props = {
  horses: StableHorse[];
  onPick: (horse: StableHorse) => void;
  onCancel: () => void;
};

export function HorsePicker({ horses, onPick, onCancel }: Props) {
  const [idx, setIdx] = useState(0);

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (horses.length === 0) return;
    if (key.upArrow) { setIdx((idx - 1 + horses.length) % horses.length); return; }
    if (key.downArrow) { setIdx((idx + 1) % horses.length); return; }
    if (key.return) { onPick(horses[idx]!); return; }
  });

  if (horses.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>No horses in your stable.</Text>
        <Text dimColor>Run `token-derby stable create` to make one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>Pick a horse to race:</Text>
      {horses.map((h, i) => (
        <Box key={h.name} flexDirection="row">
          <Text>{i === idx ? '►' : ' '} </Text>
          <HorseSprite sprite={MINI_SPRITE} colors={h.colors} />
          <Text> {h.name}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ choose · Enter pick · Esc cancel</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run test/ui/HorsePicker.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/ui/HorsePicker.tsx cli/test/ui/HorsePicker.test.tsx
git commit -m "feat(cli): HorsePicker Ink component"
```

---

## Task 15: StatusScreen Ink component

**Files:**
- Create: `cli/src/ui/StatusScreen.tsx`

A pure presentational component that takes the latest poll snapshot, the horse identity, the heartbeat status, and the time since last successful heartbeat. No tests — covered transitively by the run-race smoke test in Task 23.

- [ ] **Step 1: Write the component**

Create `/Users/omauri/personal_projects/token_derby/cli/src/ui/StatusScreen.tsx`:

```typescript
import React from 'react';
import { Box, Text } from 'ink';
import type { GetRaceResponse, HorseColors, HorseView } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { MINI_SPRITE } from './sprite.js';

type Props = {
  race: GetRaceResponse | null;
  ownHorseId: string;
  ownHorseName: string;
  ownColors: HorseColors;
  lastHeartbeatAgoSec: number | null;
  lastHeartbeatOk: boolean;
};

export function StatusScreen(props: Props) {
  const { race, ownHorseId, ownHorseName, ownColors, lastHeartbeatAgoSec, lastHeartbeatOk } = props;

  if (!race) {
    return (
      <Box flexDirection="column">
        <Text>Joining race…</Text>
      </Box>
    );
  }

  const own: HorseView | undefined = race.horses.find(h => h.horse_id === ownHorseId);
  const leader: HorseView | undefined = race.horses[0];
  const elapsedPct = elapsed(race);
  const timeLeft = formatDuration(race.time_left_seconds);

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>
        🏇 TOKEN DERBY ─── <Text bold>{race.name}</Text> ─── status: <Text color={statusColor(race.status)}>{race.status}</Text>
      </Text>

      <Box marginTop={1} flexDirection="row">
        <HorseSprite sprite={MINI_SPRITE} colors={ownColors} />
        <Text>  {ownHorseName}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text>Tokens (race):  {own?.current_tokens ?? 0}</Text>
        <Text>Position:       {own?.rank ?? '—'} of {race.horses.length}</Text>
        <Text>
          Leader:         {leader ? `${leader.name} (${leader.current_tokens})` : '—'}
        </Text>
        <Text>Race elapsed:   {(elapsedPct * 100).toFixed(0)}%  {bar(elapsedPct, 20)}</Text>
        <Text>Time left:      {timeLeft}</Text>
        <Text>
          Last heartbeat: {lastHeartbeatAgoSec === null ? '—' : `${lastHeartbeatAgoSec}s ago`}
          {' '}
          <Text color={lastHeartbeatOk ? 'green' : 'yellow'}>
            {lastHeartbeatOk ? '✓' : '⚠'}
          </Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Ctrl+C to crash out of the race.</Text>
      </Box>
    </Box>
  );
}

function elapsed(race: GetRaceResponse): number {
  const start = new Date(race.start_time).getTime();
  const end = new Date(race.end_time).getTime();
  const now = new Date(race.server_time).getTime();
  if (end <= start) return 0;
  const v = (now - start) / (end - start);
  return Math.max(0, Math.min(1, v));
}

function bar(pct: number, width: number): string {
  const filled = Math.round(pct * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

function statusColor(status: GetRaceResponse['status']): string {
  if (status === 'live') return 'green';
  if (status === 'pending') return 'yellow';
  return 'gray';
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/ui/StatusScreen.tsx
git commit -m "feat(cli): StatusScreen Ink component (live race TUI)"
```

---

## Task 16: Race runtime — orchestrate join/rejoin status loop

**Files:**
- Create: `cli/src/runtime/run-race.ts`

Wires together: transcript reader, baseline state, heartbeat loop, poll loop, the status screen, and the active-race file (persisting `last_race_tokens` after each successful heartbeat).

- [ ] **Step 1: Write the runtime**

Create `/Users/omauri/personal_projects/token_derby/cli/src/runtime/run-race.ts`:

```typescript
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from 'ink';
import type { GetRaceResponse, HeartbeatResponse } from '@token-derby/shared';
import { StatusScreen } from '../ui/StatusScreen.js';
import { runHeartbeatLoop } from './heartbeat-loop.js';
import { runPollLoop } from './poll-loop.js';
import { sumOutputTokens } from '../tokens/transcripts.js';
import { initialBaseline } from '../tokens/baseline.js';
import * as endpoints from '../api/endpoints.js';
import { saveActiveRace, type ActiveRace } from '../stable/active-race.js';
import { HEARTBEAT_INTERVAL_MS, POLL_INTERVAL_MS, HEARTBEAT_RETRY_DELAYS_MS } from '../config.js';

export type RunRaceProps = {
  active: ActiveRace;
  startingBaseline: number;
  pendingMode: boolean;
};

export function RunRace({ active, startingBaseline, pendingMode }: RunRaceProps) {
  const { exit } = useApp();
  const [race, setRace] = useState<GetRaceResponse | null>(null);
  const [lastHbAt, setLastHbAt] = useState<Date | null>(null);
  const [lastHbOk, setLastHbOk] = useState<boolean>(true);
  const [tickNow, setTickNow] = useState<Date>(new Date());

  const baselineRef = useRef(startingBaseline);
  const pendingRef = useRef(pendingMode);
  const lastTokenSampleRef = useRef<number>(startingBaseline);
  const ctrl = useRef(new AbortController());

  // Re-render every second so the "Ns ago" counter updates.
  useEffect(() => {
    const t = setInterval(() => setTickNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  // Re-snapshot baseline when race transitions pending → live.
  useEffect(() => {
    if (pendingRef.current && race?.status === 'live') {
      sumOutputTokens().then(total => {
        baselineRef.current = total;
        pendingRef.current = false;
      });
    }
  }, [race?.status]);

  useEffect(() => {
    runPollLoop({
      fetchRace: () => endpoints.getRace(active.join_code),
      intervalMs: POLL_INTERVAL_MS,
      onSnapshot: (r) => setRace(r),
      onError: () => {/* silently keep last-known state */},
      abortSignal: ctrl.current.signal,
    });

    runHeartbeatLoop({
      sendHeartbeat: async (currentTokens) => {
        const resp = await endpoints.heartbeat(
          active.join_code, active.horse_id, active.heartbeat_token, { current_tokens: currentTokens },
        );
        const updated: ActiveRace = {
          ...active,
          last_race_tokens: currentTokens,
          last_heartbeat_at: new Date().toISOString(),
        };
        await saveActiveRace(updated);
        return resp;
      },
      getCurrentTokens: () => {
        if (pendingRef.current) return 0;
        // Synchronous read against the most recent token sample taken by the sampler below.
        return Math.max(0, lastTokenSampleRef.current - baselineRef.current);
      },
      intervalMs: HEARTBEAT_INTERVAL_MS,
      retryDelaysMs: HEARTBEAT_RETRY_DELAYS_MS,
      onSuccess: (resp: HeartbeatResponse) => {
        setLastHbAt(new Date());
        setLastHbOk(true);
        if (resp.race_status === 'finished') exit();
      },
      onError: () => setLastHbOk(false),
      onFinished: () => exit(),
      abortSignal: ctrl.current.signal,
    });

    // Token sampler — refresh the running token total every 5s so the heartbeat sees fresh data.
    const sampler = setInterval(async () => {
      try {
        lastTokenSampleRef.current = await sumOutputTokens();
      } catch {/* keep last sample */}
    }, 5_000);
    // Prime it once at startup.
    sumOutputTokens().then(t => { lastTokenSampleRef.current = t; }).catch(() => {});

    const controller = ctrl.current;
    return () => {
      clearInterval(sampler);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastHeartbeatAgoSec = lastHbAt
    ? Math.max(0, Math.floor((tickNow.getTime() - lastHbAt.getTime()) / 1000))
    : null;

  return (
    <StatusScreen
      race={race}
      ownHorseId={active.horse_id}
      ownHorseName={active.horse_name}
      ownColors={active.horse_colors}
      lastHeartbeatAgoSec={lastHeartbeatAgoSec}
      lastHeartbeatOk={lastHbOk}
    />
  );
}

export async function buildInitialState(args: {
  active: ActiveRace;
  raceStatus: 'pending' | 'live';
  rejoin: boolean;
}): Promise<{ startingBaseline: number; pendingMode: boolean }> {
  const runningTotal = await sumOutputTokens();
  if (args.rejoin) {
    return {
      startingBaseline: Math.max(0, runningTotal - args.active.last_race_tokens),
      pendingMode: args.raceStatus === 'pending',
    };
  }
  return {
    startingBaseline: initialBaseline({ runningTotal, status: args.raceStatus }),
    pendingMode: args.raceStatus === 'pending',
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/runtime/run-race.ts
git commit -m "feat(cli): race runtime (poll + heartbeat + token sampler + status TUI)"
```

---

## Task 17: `stable create` command

**Files:**
- Create: `cli/src/commands/stable-create.ts`

- [ ] **Step 1: Write the command**

Create `/Users/omauri/personal_projects/token_derby/cli/src/commands/stable-create.ts`:

```typescript
import React from 'react';
import { render } from 'ink';
import { HorseCreator } from '../ui/HorseCreator.js';
import { upsertHorse, loadStable, findHorse } from '../stable/stable.js';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export async function stableCreateCommand(): Promise<number> {
  let exitCode = 0;
  const app = render(
    React.createElement(HorseCreator, {
      onSubmit: async (name, colors) => {
        const stable = await loadStable();
        const existing = findHorse(stable, name);
        if (existing) {
          app.unmount();
          const rl = readline.createInterface({ input: stdin, output: stdout });
          const answer = (await rl.question(`Horse "${name}" already exists. Overwrite? [y/N] `)).trim().toLowerCase();
          rl.close();
          if (answer !== 'y' && answer !== 'yes') {
            console.log('Cancelled.');
            exitCode = 1;
            return;
          }
        }
        await upsertHorse({ name, colors, created_at: new Date().toISOString() });
        app.unmount();
        console.log(`✓ Saved "${name}" to your stable.`);
      },
      onCancel: () => {
        app.unmount();
        console.log('Cancelled.');
        exitCode = 1;
      },
    }),
  );
  await app.waitUntilExit();
  return exitCode;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/commands/stable-create.ts
git commit -m "feat(cli): stable create command"
```

---

## Task 18: `stable list` command

**Files:**
- Create: `cli/src/commands/stable-list.ts`

- [ ] **Step 1: Write the command**

Create `/Users/omauri/personal_projects/token_derby/cli/src/commands/stable-list.ts`:

```typescript
import React from 'react';
import { render, Box, Text } from 'ink';
import { loadStable } from '../stable/stable.js';
import { HorseSprite } from '../ui/HorseSprite.js';
import { MINI_SPRITE } from '../ui/sprite.js';

export async function stableListCommand(): Promise<number> {
  const stable = await loadStable();
  if (stable.horses.length === 0) {
    console.log('Your stable is empty. Run `token-derby stable create` to add a horse.');
    return 0;
  }
  const app = render(
    React.createElement(StableList, { horses: stable.horses }),
  );
  await app.waitUntilExit();
  return 0;
}

function StableList({ horses }: { horses: { name: string; colors: any; created_at: string }[] }) {
  // Render once, then exit immediately so the CLI behaves like a normal `ls`.
  React.useEffect(() => {
    setImmediate(() => process.exit(0));
  }, []);
  return (
    <Box flexDirection="column">
      <Text bold>Your stable ({horses.length}):</Text>
      {horses.map(h => (
        <Box key={h.name} flexDirection="row" marginTop={1}>
          <HorseSprite sprite={MINI_SPRITE} colors={h.colors} />
          <Text>  {h.name}</Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/commands/stable-list.ts
git commit -m "feat(cli): stable list command (renders mini sprites)"
```

---

## Task 19: `stable delete` command

**Files:**
- Create: `cli/src/commands/stable-delete.ts`

- [ ] **Step 1: Write the command**

Create `/Users/omauri/personal_projects/token_derby/cli/src/commands/stable-delete.ts`:

```typescript
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadStable, findHorse, removeHorse } from '../stable/stable.js';
import { listActiveRaces, loadActiveRace } from '../stable/active-race.js';

export async function stableDeleteCommand(name: string | undefined): Promise<number> {
  if (!name) {
    console.error('Usage: token-derby stable delete <name>');
    return 2;
  }
  const stable = await loadStable();
  const horse = findHorse(stable, name);
  if (!horse) {
    console.error(`No horse named "${name}" in your stable.`);
    return 1;
  }

  const codes = await listActiveRaces();
  for (const code of codes) {
    const active = await loadActiveRace(code);
    if (active?.horse_name === name) {
      console.error(`"${name}" is currently running in race ${code}. Close that terminal first.`);
      return 1;
    }
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`Delete "${name}" from your stable? [y/N] `)).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') {
    console.log('Cancelled.');
    return 1;
  }
  await removeHorse(name);
  console.log(`✓ Deleted "${name}".`);
  return 0;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/commands/stable-delete.ts
git commit -m "feat(cli): stable delete command (with active-race guard)"
```

---

## Task 20: `create` race command

**Files:**
- Create: `cli/src/commands/create.ts`

- [ ] **Step 1: Write the command**

Create `/Users/omauri/personal_projects/token_derby/cli/src/commands/create.ts`:

```typescript
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createRace } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

const DEFAULT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export async function createRaceCommand(): Promise<number> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const name = (await rl.question('Race name: ')).trim();
    if (!name) { console.error('Name required.'); return 1; }

    const start = (await rl.question('Start time (ISO 8601, e.g. 2026-04-23T15:00:00Z): ')).trim();
    if (!isIso(start)) { console.error('Invalid start time.'); return 1; }

    const end = (await rl.question('End time (ISO 8601): ')).trim();
    if (!isIso(end)) { console.error('Invalid end time.'); return 1; }
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      console.error('End time must be after start time.'); return 1;
    }

    const tz = (await rl.question(`Time zone [${DEFAULT_TZ}]: `)).trim() || DEFAULT_TZ;
    const maxRaw = (await rl.question('Max participants [30]: ')).trim();
    const max = maxRaw ? parseInt(maxRaw, 10) : undefined;
    if (max !== undefined && (!Number.isFinite(max) || max < 1)) {
      console.error('Max participants must be a positive number.'); return 1;
    }

    const resp = await createRace({
      name, start_time: start, end_time: end, tz,
      ...(max !== undefined ? { max_participants: max } : {}),
    });

    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log(`  ║   JOIN CODE:  ${resp.join_code.padEnd(23)}║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
    console.log(`  Admin code:  ${resp.admin_code}`);
    console.log('  ⚠  Save the admin code — you need it to end the race early.');
    console.log('');
    console.log(`  Share with participants:  token-derby join ${resp.join_code}`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  } finally {
    rl.close();
  }
}

function isIso(s: string): boolean {
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/commands/create.ts
git commit -m "feat(cli): create race command (interactive wizard)"
```

---

## Task 21: `join` command

**Files:**
- Create: `cli/src/commands/join.ts`

- [ ] **Step 1: Write the command**

Create `/Users/omauri/personal_projects/token_derby/cli/src/commands/join.ts`:

```typescript
import React from 'react';
import { render } from 'ink';
import { loadStable } from '../stable/stable.js';
import { HorsePicker } from '../ui/HorsePicker.js';
import { joinRace, getRace } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { saveActiveRace, type ActiveRace } from '../stable/active-race.js';
import { RunRace, buildInitialState } from '../runtime/run-race.js';

export async function joinCommand(joinCode: string | undefined): Promise<number> {
  if (!joinCode) {
    console.error('Usage: token-derby join <join-code>');
    return 2;
  }
  const code = joinCode.toUpperCase();

  const stable = await loadStable();
  if (stable.horses.length === 0) {
    console.error('Your stable is empty. Run `token-derby stable create` first.');
    return 1;
  }

  const picked = await pickHorse(stable.horses);
  if (!picked) { console.log('Cancelled.'); return 1; }

  let joinResp;
  try {
    joinResp = await joinRace(code, { horse: { name: picked.name, colors: picked.colors } });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'RACE_FULL') console.error(`This race is full.`);
      else if (e.code === 'RACE_FINISHED') console.error('This race has ended.');
      else if (e.code === 'RACE_NOT_FOUND') console.error(`No race with join code ${code}.`);
      else console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }

  const race = await getRace(code);
  if (race.status === 'finished') {
    console.error('Race finished after join. Exiting.');
    return 1;
  }
  const status: 'pending' | 'live' = race.status;

  const active: ActiveRace = {
    join_code: code,
    race_id: race.race_id,
    horse_id: joinResp.horse_id,
    heartbeat_token: joinResp.heartbeat_token,
    horse_name: picked.name,
    horse_colors: picked.colors,
    joined_at: new Date().toISOString(),
    last_race_tokens: 0,
    last_heartbeat_at: new Date(0).toISOString(),
  };
  await saveActiveRace(active);

  const initial = await buildInitialState({ active, raceStatus: status, rejoin: false });
  const app = render(React.createElement(RunRace, { active, ...initial }));
  await app.waitUntilExit();
  return 0;
}

async function pickHorse(horses: any[]): Promise<any | null> {
  return new Promise(resolve => {
    const app = render(
      React.createElement(HorsePicker, {
        horses,
        onPick: (h: any) => { app.unmount(); resolve(h); },
        onCancel: () => { app.unmount(); resolve(null); },
      }),
    );
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/commands/join.ts
git commit -m "feat(cli): join command (picker + status loop)"
```

---

## Task 22: `rejoin` command

**Files:**
- Create: `cli/src/commands/rejoin.ts`

- [ ] **Step 1: Write the command**

Create `/Users/omauri/personal_projects/token_derby/cli/src/commands/rejoin.ts`:

```typescript
import React from 'react';
import { render } from 'ink';
import { loadActiveRace } from '../stable/active-race.js';
import { getRace } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { RunRace, buildInitialState } from '../runtime/run-race.js';

export async function rejoinCommand(joinCode: string | undefined): Promise<number> {
  if (!joinCode) {
    console.error('Usage: token-derby rejoin <join-code>');
    return 2;
  }
  const code = joinCode.toUpperCase();

  const active = await loadActiveRace(code);
  if (!active) {
    console.error(`No saved active-race state for ${code}. Use \`token-derby join ${code}\` to enter as a new horse.`);
    return 1;
  }

  let race;
  try {
    race = await getRace(code);
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
  if (race.status === 'finished') {
    console.error('Race already finished.');
    return 1;
  }
  const status: 'pending' | 'live' = race.status;

  const initial = await buildInitialState({ active, raceStatus: status, rejoin: true });
  const app = render(React.createElement(RunRace, { active, ...initial }));
  await app.waitUntilExit();
  return 0;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/commands/rejoin.ts
git commit -m "feat(cli): rejoin command (re-baseline + resume)"
```

---

## Task 23: `end` command

**Files:**
- Create: `cli/src/commands/end.ts`

- [ ] **Step 1: Write the command**

Create `/Users/omauri/personal_projects/token_derby/cli/src/commands/end.ts`:

```typescript
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { endRace } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function endCommand(adminCode: string | undefined): Promise<number> {
  if (!adminCode) {
    console.error('Usage: token-derby end <admin-code>');
    return 2;
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question('End the race now and freeze final tokens? [y/N] ')).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') {
    console.log('Cancelled.');
    return 1;
  }
  try {
    await endRace(adminCode);
    console.log('✓ Race ended.');
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'RACE_NOT_FOUND') console.error('No race with that admin code.');
      else console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/commands/end.ts
git commit -m "feat(cli): end command (DELETE /races/admin/:code)"
```

---

## Task 24: bin entrypoint + dispatch

**Files:**
- Create: `cli/src/bin.ts`

- [ ] **Step 1: Write the bin**

Create `/Users/omauri/personal_projects/token_derby/cli/src/bin.ts`:

```typescript
import { stableCreateCommand } from './commands/stable-create.js';
import { stableListCommand } from './commands/stable-list.js';
import { stableDeleteCommand } from './commands/stable-delete.js';
import { createRaceCommand } from './commands/create.js';
import { joinCommand } from './commands/join.js';
import { rejoinCommand } from './commands/rejoin.js';
import { endCommand } from './commands/end.js';

const VERSION = '0.1.0';

const HELP = `token-derby v${VERSION}

Stable management:
  token-derby stable create               Make a new horse (interactive)
  token-derby stable list                 Show your saved horses
  token-derby stable delete <name>        Remove a horse from your stable

Races:
  token-derby create                      Create a new race (interactive)
  token-derby join <join-code>            Pick a horse and join a race
  token-derby rejoin <join-code>          Resume a race after a disconnect
  token-derby end <admin-code>            End a race early

Environment:
  TOKEN_DERBY_API_BASE                    Override API base URL (default: production)
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '--help' || cmd === '-h') { console.log(HELP); return 0; }
  if (cmd === '--version' || cmd === '-v') { console.log(VERSION); return 0; }

  if (cmd === 'stable') {
    const sub = argv[1];
    if (sub === 'create') return stableCreateCommand();
    if (sub === 'list') return stableListCommand();
    if (sub === 'delete') return stableDeleteCommand(argv[2]);
    console.error(`Unknown stable subcommand: ${sub ?? '(none)'}`);
    console.error('Try: stable create | stable list | stable delete <name>');
    return 2;
  }

  if (cmd === 'create') return createRaceCommand();
  if (cmd === 'join')   return joinCommand(argv[1]);
  if (cmd === 'rejoin') return rejoinCommand(argv[1]);
  if (cmd === 'end')    return endCommand(argv[1]);

  console.error(`Unknown command: ${cmd}`);
  console.error(HELP);
  return 2;
}

main().then(
  code => process.exit(code),
  err => {
    console.error(err?.stack ?? err);
    process.exit(1);
  },
);
```

- [ ] **Step 2: Build**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npm run build
ls dist/
```

Expected: `dist/bin.js` (and a sourcemap). The first line of `dist/bin.js` should be `#!/usr/bin/env node` (added by tsup banner config).

- [ ] **Step 3: Smoke-test help**

```bash
node dist/bin.js --help
node dist/bin.js --version
```

Expected: help text prints; version prints `0.1.0`.

- [ ] **Step 4: Smoke-test stable list (empty)**

```bash
TOKEN_DERBY_HOME=/tmp/td-smoke node dist/bin.js stable list
```

Expected: `Your stable is empty. Run \`token-derby stable create\` to add a horse.`

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/src/bin.ts
git commit -m "feat(cli): bin entry — argv dispatch + help/version"
```

---

## Task 25: Run the full CLI test suite

- [ ] **Step 1: Run all CLI tests**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npx vitest run
```

Expected: All tests pass (roughly 60+ across all `test/` files).

- [ ] **Step 2: If any test fails, fix the underlying cause**

Do not silence failures with conditionals or skip blocks. If an Ink component test is flaky because frames batch, add a `setImmediate(r => …)` await between `stdin.write` and the assertion, but only if the failure is reproducibly timing-related — diagnose first.

---

## Task 26: End-to-end smoke test against the deployed API

- [ ] **Step 1: Create a short race via the CLI**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
node dist/bin.js create
# When prompted:
#   Race name:        CLI Smoke
#   Start time:       <now-1m, ISO Z>
#   End time:         <now+5m, ISO Z>
#   Time zone:        (accept default)
#   Max participants: (accept default)
```

Expected: prints `JOIN CODE: XXXXXX` and `Admin code: <uuid>`. Save both — you'll need them in the next steps.

If you want to skip the interactive prompt, hit the deployed API directly with curl per Plan 1 Task 22, then use that join code.

- [ ] **Step 2: Make a horse**

```bash
node dist/bin.js stable create
# Cycle a few colors with arrow keys, accept, name it "SmokeHorse".
```

Expected: `✓ Saved "SmokeHorse" to your stable.`

- [ ] **Step 3: Join the race**

```bash
node dist/bin.js join <JOIN-CODE>
```

Expected: HorsePicker shows SmokeHorse → press Enter → status screen renders. The "Tokens (race)" counter starts at 0 and increases as Claude Code generates output in the same machine. Heartbeat indicator shows `✓` after the first successful POST. Polls update positions every 3s.

- [ ] **Step 4: Crash and rejoin**

In the join terminal, press `Ctrl+C`. Then:

```bash
node dist/bin.js rejoin <JOIN-CODE>
```

Expected: status screen reappears. The tokens counter resumes at the last persisted value (not at 0).

- [ ] **Step 5: End the race**

In a second terminal:

```bash
node /Users/omauri/personal_projects/token_derby/cli/dist/bin.js end <ADMIN-CODE>
# Confirm with `y`.
```

Expected: `✓ Race ended.` In the first terminal, the heartbeat receives `race_status: finished` and the CLI exits.

- [ ] **Step 6: No commit needed** — smoke test only.

---

## Task 27: README and npm publish

**Files:**
- Create: `cli/README.md`
- Modify: `README.md` (root) — add CLI install instructions

- [ ] **Step 1: Write cli/README.md**

Create `/Users/omauri/personal_projects/token_derby/cli/README.md`:

```markdown
# Token Derby CLI

Run a horse in a Token Derby race. Each token your Claude Code generates moves your horse forward; the terminal is your horse's life support — close it and you crash.

## Install

```bash
npm i -g @mauricode/token-derby
```

Requires Node 20+.

## Usage

```bash
# 1. Make a horse (pixel-art picker)
token-derby stable create

# 2. Show your stable
token-derby stable list

# 3. Create a race
token-derby create

# 4. Join a race (uses the join code printed by `create`)
token-derby join <join-code>

# 5. If you crash, resume:
token-derby rejoin <join-code>

# 6. End a race early (admin only)
token-derby end <admin-code>
```

## What's tracked

The CLI sums `message.usage.output_tokens` across every `*.jsonl` under `~/.claude/projects/`. Your "race tokens" are everything generated since the moment you joined. Tokens generated while disconnected are skipped — that window is your crash penalty.

## Files

- `~/.token-derby/stable.json` — saved horses
- `~/.token-derby/active-races/<join-code>.json` — per-race state for rejoin

## Environment

- `TOKEN_DERBY_API_BASE` — override the API base URL (default: production)
- `TOKEN_DERBY_HOME` — override the data directory (default: `~/.token-derby`)
- `TOKEN_DERBY_CLAUDE_DIR` — override the transcripts directory (default: `~/.claude/projects`)

## Project home

Source and design notes: https://github.com/<owner>/token_derby
```

- [ ] **Step 2: Update root README with CLI install**

Modify `/Users/omauri/personal_projects/token_derby/README.md` — replace the line `- \`cli/\` — \`@mauricode/token-derby\` npm package (shipped in Plan 2)` with:

```markdown
- `cli/` — [`@mauricode/token-derby`](https://www.npmjs.com/package/@mauricode/token-derby) npm package — see `cli/README.md`
```

And add a new **Install the CLI** section just before the **Local development** section:

```markdown
## Install the CLI

```bash
npm i -g @mauricode/token-derby
token-derby --help
```

```

- [ ] **Step 3: Verify the package contents look right before publish**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npm pack --dry-run
```

Expected: lists `dist/bin.js`, `dist/bin.js.map`, `package.json`, `README.md`. No source files, no test files, no `node_modules/`.

If unwanted files show up, fix `package.json` `files` field rather than adding a `.npmignore`.

- [ ] **Step 4: Log into npm**

```bash
npm whoami
# If not logged in:
npm login
```

Expected: prints your npm username. You must be a member (or owner) of the `mauricode` org with publish rights, or the publish in Step 6 will fail with `403`.

- [ ] **Step 5: Confirm version is 0.1.0 and not already published**

```bash
npm view @mauricode/token-derby versions --json 2>/dev/null
```

Expected: errors with `404` (package does not exist yet) — that's the correct state for a first publish. If a version is shown, bump `cli/package.json` `version` to `0.1.1` and re-run the build.

- [ ] **Step 6: Publish**

```bash
cd /Users/omauri/personal_projects/token_derby/cli
npm publish
```

Expected: tarball uploads, `+ @mauricode/token-derby@0.1.0` printed. The `prepublishOnly` script reruns build + tests as a final guard.

- [ ] **Step 7: Verify the global install works**

```bash
npm i -g @mauricode/token-derby
token-derby --version
which token-derby
```

Expected: prints `0.1.0`; `which` shows a path inside the global npm prefix.

- [ ] **Step 8: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add cli/README.md README.md
git commit -m "docs(cli): README and root install instructions"
```

---

## Done — what Plan 2 produced

- New `cli/` workspace with the Ink-based `@mauricode/token-derby` CLI
- Stable management (`stable create`/`list`/`delete`) with a pixel-preview horse creator
- Race lifecycle (`create`/`join`/`rejoin`/`end`) talking to the Plan 1 API
- Heartbeat loop driven by Claude Code transcript output_tokens, with retry/backoff
- Live status TUI polling every 3s
- Crash detection by closing the terminal; rejoin re-baselines so disconnected tokens don't count
- Published as a public scoped npm package, installable globally with `npm i -g @mauricode/token-derby`

**Plan 3 (Site)** picks up next — it ships the static race viewer at `https://token-derby.mauricode.co.uk` so spectators can watch races without the CLI.
