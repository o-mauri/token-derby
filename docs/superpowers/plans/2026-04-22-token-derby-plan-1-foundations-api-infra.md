# Token Derby — Plan 1: Foundations, API & Infra

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a curl-testable Token Derby API at `https://token-derby.mauricode.co.uk/api/*` backed by DynamoDB, deployed via CDK in `eu-west-2`, with CloudFront serving a placeholder page at the root until Plans 2/3 land.

**Architecture:** Monorepo with `shared/`, `api/`, and `infra/` packages. `api/` exports five Lambda handlers (`createRace`, `getRace`, `joinRace`, `heartbeat`, `endRace`) on top of a single DynamoDB table. `infra/` is a CDK stack that wires everything together and puts it behind CloudFront with a custom domain. TDD for pure logic and DB helpers (unit tests + DynamoDB Local integration tests via vitest).

**Tech Stack:** Node 22, TypeScript 5.6+, npm workspaces, vitest 2, `@aws-sdk/client-dynamodb` v3, `@aws-sdk/lib-dynamodb`, AWS CDK 2, DynamoDB Local (Docker), esbuild (for Lambda bundling via `aws-cdk-lib/aws-lambda-nodejs`).

**Spec:** `docs/superpowers/specs/2026-04-21-token-derby-design.md`

---

## File structure this plan creates

```
token_derby/
├── package.json                    # root workspace config
├── tsconfig.base.json              # shared compiler options
├── Makefile                        # common dev commands
├── docker-compose.yml              # DynamoDB Local
├── README.md                       # project overview + API examples
│
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── types.ts                # Race, Horse, RaceStatus, HorseColors
│       ├── api.ts                  # CreateRaceRequest/Response etc.
│       ├── errors.ts               # ErrorCode, ErrorEnvelope, ERROR_STATUS
│       ├── constants.ts            # thresholds, defaults
│       └── index.ts                # re-exports
│
├── api/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── db/
│   │   │   ├── client.ts           # shared DynamoDB DocumentClient
│   │   │   ├── keys.ts             # pk/sk formatting + parsing
│   │   │   ├── races.ts            # race CRUD
│   │   │   └── horses.ts           # horse CRUD + query-all
│   │   ├── lib/
│   │   │   ├── codes.ts            # join-code / admin-code / horse-id / heartbeat-token generators
│   │   │   ├── status.ts           # derived race status + crashed flag
│   │   │   └── http.ts             # Lambda response helpers
│   │   └── handlers/
│   │       ├── create-race.ts
│   │       ├── get-race.ts
│   │       ├── join-race.ts
│   │       ├── heartbeat.ts
│   │       └── end-race.ts
│   └── test/
│       ├── setup.ts                # vitest global setup (DynamoDB Local table)
│       ├── db/
│       │   ├── keys.test.ts
│       │   ├── races.test.ts
│       │   └── horses.test.ts
│       ├── lib/
│       │   ├── codes.test.ts
│       │   └── status.test.ts
│       └── handlers/
│           ├── create-race.test.ts
│           ├── get-race.test.ts
│           ├── join-race.test.ts
│           ├── heartbeat.test.ts
│           └── end-race.test.ts
│
└── infra/
    ├── package.json
    ├── tsconfig.json
    ├── cdk.json
    ├── bin/
    │   └── token-derby.ts
    ├── lib/
    │   └── token-derby-stack.ts
    └── site-placeholder/
        └── index.html              # placeholder served at /
```

---

## Task 1: Initialize root workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `Makefile`
- Modify: `.gitignore`

- [ ] **Step 1: Write root package.json**

Create `/Users/omauri/personal_projects/token_derby/package.json`:

```json
{
  "name": "token-derby",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["shared", "api", "infra"],
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "npm -ws run build",
    "test": "npm -ws --if-present run test",
    "lint": "npm -ws --if-present run lint"
  }
}
```

- [ ] **Step 2: Write tsconfig.base.json**

Create `/Users/omauri/personal_projects/token_derby/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 3: Write Makefile**

Create `/Users/omauri/personal_projects/token_derby/Makefile`:

```makefile
.PHONY: install build test dynamodb-up dynamodb-down deploy

install:
	npm install

build:
	npm run build

test:
	npm test

dynamodb-up:
	docker compose up -d dynamodb
	@echo "DynamoDB Local is running on http://localhost:8000"

dynamodb-down:
	docker compose down

deploy:
	cd infra && npx cdk deploy --require-approval never
```

- [ ] **Step 4: Append to .gitignore**

Modify `/Users/omauri/personal_projects/token_derby/.gitignore` — append these lines if not already present:

```
# TypeScript
*.tsbuildinfo
dist/

# CDK
cdk.out/
cdk.context.json

# Docker volumes
docker-data/
```

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add package.json tsconfig.base.json Makefile .gitignore
git commit -m "chore: scaffold root monorepo workspace"
```

---

## Task 2: Add DynamoDB Local via docker-compose

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write docker-compose.yml**

Create `/Users/omauri/personal_projects/token_derby/docker-compose.yml`:

```yaml
services:
  dynamodb:
    image: amazon/dynamodb-local:latest
    container_name: token-derby-dynamodb
    command: -jar DynamoDBLocal.jar -sharedDb -inMemory
    ports:
      - "8000:8000"
```

- [ ] **Step 2: Verify it starts**

Run:

```bash
cd /Users/omauri/personal_projects/token_derby
make dynamodb-up
curl -s http://localhost:8000 && echo
```

Expected: a small HTML error from DynamoDB Local (it returns 400 HTML on GET `/`; that's fine — proves the port is open). Run `make dynamodb-down` to stop.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add DynamoDB Local via docker-compose"
```

---

## Task 3: Create shared package with domain types

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/types.ts`
- Create: `shared/src/index.ts`

- [ ] **Step 1: Write shared/package.json**

Create `/Users/omauri/personal_projects/token_derby/shared/package.json`:

```json
{
  "name": "@token-derby/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p .",
    "test": "echo 'no tests in shared'"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write shared/tsconfig.json**

Create `/Users/omauri/personal_projects/token_derby/shared/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write shared/src/types.ts**

Create `/Users/omauri/personal_projects/token_derby/shared/src/types.ts`:

```typescript
export type HorseColors = {
  body: string;
  mane: string;
  tail: string;
  saddle: string;
};

export type Horse = {
  horse_id: string;
  name: string;
  colors: HorseColors;
  current_tokens: number;
  last_heartbeat: string;
  joined_at: string;
  final_tokens?: number;
};

export type RaceStatus = 'pending' | 'live' | 'finished';

export type Race = {
  race_id: string;
  name: string;
  start_time: string;
  end_time: string;
  tz: string;
  max_participants: number;
  join_code: string;
  created_at: string;
  ended_at?: string;
};

export type HorseView = Horse & {
  rank: number;
  crashed: boolean;
};

export type RaceView = Race & {
  status: RaceStatus;
  horses: HorseView[];
  server_time: string;
  time_left_seconds: number;
};
```

- [ ] **Step 4: Write shared/src/index.ts**

Create `/Users/omauri/personal_projects/token_derby/shared/src/index.ts`:

```typescript
export * from './types.js';
```

- [ ] **Step 5: Install and build**

Run from repo root:

```bash
cd /Users/omauri/personal_projects/token_derby
npm install
npm -w @token-derby/shared run build
ls shared/dist
```

Expected: `dist/` contains `index.js`, `index.d.ts`, `types.js`, `types.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add shared/ package-lock.json
git commit -m "feat(shared): domain types (Race, Horse, RaceStatus, views)"
```

---

## Task 4: Add API contracts, errors, and constants to shared

**Files:**
- Create: `shared/src/api.ts`
- Create: `shared/src/errors.ts`
- Create: `shared/src/constants.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write shared/src/api.ts**

Create `/Users/omauri/personal_projects/token_derby/shared/src/api.ts`:

```typescript
import type { HorseColors, RaceStatus, RaceView } from './types.js';

export type CreateRaceRequest = {
  name: string;
  start_time: string;
  end_time: string;
  tz: string;
  max_participants?: number;
};

export type CreateRaceResponse = {
  race_id: string;
  join_code: string;
  admin_code: string;
};

export type GetRaceResponse = RaceView;

export type JoinRaceRequest = {
  horse: {
    name: string;
    colors: HorseColors;
  };
};

export type JoinRaceResponse = {
  horse_id: string;
  heartbeat_token: string;
};

export type HeartbeatRequest = {
  current_tokens: number;
};

export type HeartbeatResponse = {
  race_status: RaceStatus;
  server_time: string;
  time_left_seconds: number;
};

export type EndRaceResponse = {
  ok: true;
};
```

- [ ] **Step 2: Write shared/src/errors.ts**

Create `/Users/omauri/personal_projects/token_derby/shared/src/errors.ts`:

```typescript
export type ErrorCode =
  | 'RACE_NOT_FOUND'
  | 'RACE_FULL'
  | 'RACE_FINISHED'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST';

export type ErrorEnvelope = {
  code: ErrorCode;
  message: string;
};

export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  INVALID_TOKEN: 401,
  RACE_NOT_FOUND: 404,
  RACE_FULL: 409,
  RACE_FINISHED: 410,
  RATE_LIMITED: 429,
};
```

- [ ] **Step 3: Write shared/src/constants.ts**

Create `/Users/omauri/personal_projects/token_derby/shared/src/constants.ts`:

```typescript
export const DEFAULT_MAX_PARTICIPANTS = 30;
export const HEARTBEAT_CRASH_TIMEOUT_MS = 120_000;
export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
```

Note: alphabet excludes `I`, `O`, `0`, `1` — easy to read aloud and type.

- [ ] **Step 4: Update shared/src/index.ts**

Replace `/Users/omauri/personal_projects/token_derby/shared/src/index.ts` with:

```typescript
export * from './types.js';
export * from './api.js';
export * from './errors.js';
export * from './constants.js';
```

- [ ] **Step 5: Build and commit**

```bash
cd /Users/omauri/personal_projects/token_derby
npm -w @token-derby/shared run build
git add shared/
git commit -m "feat(shared): API contracts, error codes, and constants"
```

---

## Task 5: Create api package skeleton

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/vitest.config.ts`
- Create: `api/test/setup.ts`

- [ ] **Step 1: Write api/package.json**

Create `/Users/omauri/personal_projects/token_derby/api/package.json`:

```json
{
  "name": "@token-derby/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.650.0",
    "@aws-sdk/lib-dynamodb": "^3.650.0",
    "@token-derby/shared": "*"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.145",
    "@types/node": "^22.7.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write api/tsconfig.json**

Create `/Users/omauri/personal_projects/token_derby/api/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "types": ["node"],
    "paths": {
      "@token-derby/shared": ["../shared/src/index.ts"]
    }
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Write api/vitest.config.ts**

Create `/Users/omauri/personal_projects/token_derby/api/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@token-derby/shared': new URL('../shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 4: Write api/test/setup.ts**

Create `/Users/omauri/personal_projects/token_derby/api/test/setup.ts`:

```typescript
import { beforeAll, afterAll } from 'vitest';
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';

export const TEST_TABLE = `token-derby-test-${process.pid}-${Date.now()}`;

process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
process.env.AWS_REGION = 'local';
process.env.AWS_ACCESS_KEY_ID = 'fake';
process.env.AWS_SECRET_ACCESS_KEY = 'fake';
process.env.TABLE_NAME = TEST_TABLE;

const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT,
  region: 'local',
  credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
});

beforeAll(async () => {
  await client.send(new CreateTableCommand({
    TableName: TEST_TABLE,
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
      { AttributeName: 'join_code', AttributeType: 'S' },
      { AttributeName: 'admin_code', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'JoinCodeIndex',
        KeySchema: [{ AttributeName: 'join_code', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'AdminCodeIndex',
        KeySchema: [{ AttributeName: 'admin_code', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));
});

afterAll(async () => {
  try {
    await client.send(new DeleteTableCommand({ TableName: TEST_TABLE }));
  } catch (e) {
    if (!(e instanceof ResourceNotFoundException)) throw e;
  }
});
```

- [ ] **Step 5: Install deps**

Run from repo root:

```bash
cd /Users/omauri/personal_projects/token_derby
npm install
```

Expected: installs vitest, aws-sdk, etc. with no errors.

- [ ] **Step 6: Commit**

```bash
git add api/ package-lock.json
git commit -m "chore(api): scaffold package, vitest config, test setup"
```

---

## Task 6: Key helpers (pk/sk formatters) with TDD

**Files:**
- Create: `api/test/db/keys.test.ts`
- Create: `api/src/db/keys.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/omauri/personal_projects/token_derby/api/test/db/keys.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { raceMetaKey, horseKey, parseHorseId } from '../../src/db/keys.js';

describe('keys', () => {
  it('formats race meta key', () => {
    expect(raceMetaKey('r123')).toEqual({ pk: 'RACE#r123', sk: 'META' });
  });

  it('formats horse key', () => {
    expect(horseKey('r123', 'h9')).toEqual({ pk: 'RACE#r123', sk: 'HORSE#h9' });
  });

  it('parses horse_id from sk', () => {
    expect(parseHorseId('HORSE#h9')).toBe('h9');
  });

  it('returns null when sk is not a horse', () => {
    expect(parseHorseId('META')).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/omauri/personal_projects/token_derby/api
npx vitest run test/db/keys.test.ts
```

Expected: FAIL with "Cannot find module '../../src/db/keys.js'" or similar.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/omauri/personal_projects/token_derby/api/src/db/keys.ts`:

```typescript
export function raceMetaKey(race_id: string) {
  return { pk: `RACE#${race_id}`, sk: 'META' };
}

export function horseKey(race_id: string, horse_id: string) {
  return { pk: `RACE#${race_id}`, sk: `HORSE#${horse_id}` };
}

export function parseHorseId(sk: string): string | null {
  const prefix = 'HORSE#';
  return sk.startsWith(prefix) ? sk.slice(prefix.length) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run test/db/keys.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/db/keys.ts api/test/db/keys.test.ts
git commit -m "feat(api): pk/sk key helpers for DynamoDB single-table"
```

---

## Task 7: DynamoDB client singleton

**Files:**
- Create: `api/src/db/client.ts`

- [ ] **Step 1: Write client.ts**

Create `/Users/omauri/personal_projects/token_derby/api/src/db/client.ts`:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const endpoint = process.env.DYNAMODB_ENDPOINT;

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    ...(endpoint ? { endpoint } : {}),
    region: process.env.AWS_REGION ?? 'eu-west-2',
  }),
  {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  },
);

export const TABLE = process.env.TABLE_NAME ?? 'token-derby';
```

- [ ] **Step 2: Commit**

```bash
git add api/src/db/client.ts
git commit -m "feat(api): DynamoDB document client singleton"
```

---

## Task 8: Races DB module (create, get, end) with integration tests

**Files:**
- Create: `api/test/db/races.test.ts`
- Create: `api/src/db/races.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/api/test/db/races.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { putRace, getRaceById, getRaceByJoinCode, getRaceByAdminCode, setRaceEnded } from '../../src/db/races.js';
import type { Race } from '@token-derby/shared';

function makeRace(overrides: Partial<Race> = {}): Race {
  return {
    race_id: `r-${Math.random().toString(36).slice(2)}`,
    name: 'Test Race',
    start_time: '2026-04-22T09:00:00Z',
    end_time: '2026-04-22T17:00:00Z',
    tz: 'Europe/London',
    max_participants: 30,
    join_code: `J${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('races db', () => {
  it('puts and reads a race by id', async () => {
    const race = makeRace();
    await putRace(race, 'admin-secret-123');
    const fetched = await getRaceById(race.race_id);
    expect(fetched).toEqual(race);
  });

  it('finds a race by join code', async () => {
    const race = makeRace();
    await putRace(race, 'admin-secret-456');
    const fetched = await getRaceByJoinCode(race.join_code);
    expect(fetched?.race_id).toBe(race.race_id);
  });

  it('finds a race by admin code', async () => {
    const race = makeRace();
    const admin = 'admin-secret-789';
    await putRace(race, admin);
    const fetched = await getRaceByAdminCode(admin);
    expect(fetched?.race_id).toBe(race.race_id);
  });

  it('returns null for unknown codes', async () => {
    expect(await getRaceByJoinCode('NOPE99')).toBe(null);
    expect(await getRaceByAdminCode('no-admin')).toBe(null);
  });

  it('sets ended_at on a race', async () => {
    const race = makeRace();
    await putRace(race, 'admin-x');
    const now = new Date().toISOString();
    await setRaceEnded(race.race_id, now);
    const fetched = await getRaceById(race.race_id);
    expect(fetched?.ended_at).toBe(now);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Start DynamoDB Local, then run tests:

```bash
cd /Users/omauri/personal_projects/token_derby
make dynamodb-up
cd api
npx vitest run test/db/races.test.ts
```

Expected: FAIL with "Cannot find module '../../src/db/races.js'".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/api/src/db/races.ts`:

```typescript
import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { raceMetaKey } from './keys.js';
import type { Race } from '@token-derby/shared';

export async function putRace(race: Race, admin_code: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...raceMetaKey(race.race_id),
      ...race,
      admin_code,
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
}

export async function getRaceById(race_id: string): Promise<Race | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: raceMetaKey(race_id),
  }));
  if (!Item) return null;
  return pickRace(Item);
}

export async function getRaceByJoinCode(join_code: string): Promise<Race | null> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'JoinCodeIndex',
    KeyConditionExpression: 'join_code = :c',
    ExpressionAttributeValues: { ':c': join_code },
    Limit: 1,
  }));
  const item = Items[0];
  return item ? pickRace(item) : null;
}

export async function getRaceByAdminCode(admin_code: string): Promise<Race | null> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'AdminCodeIndex',
    KeyConditionExpression: 'admin_code = :c',
    ExpressionAttributeValues: { ':c': admin_code },
    Limit: 1,
  }));
  const item = Items[0];
  return item ? pickRace(item) : null;
}

export async function setRaceEnded(race_id: string, ended_at: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: raceMetaKey(race_id),
    UpdateExpression: 'SET ended_at = :e',
    ExpressionAttributeValues: { ':e': ended_at },
  }));
}

function pickRace(item: Record<string, any>): Race {
  const { pk: _pk, sk: _sk, admin_code: _admin, ...rest } = item;
  return rest as Race;
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/omauri/personal_projects/token_derby/api
npx vitest run test/db/races.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/db/races.ts api/test/db/races.test.ts
git commit -m "feat(api): race DB module (put, get by id/join/admin, end)"
```

---

## Task 9: Horses DB module with integration tests

**Files:**
- Create: `api/test/db/horses.test.ts`
- Create: `api/src/db/horses.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/api/test/db/horses.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { putHorse, listHorses, updateHorseTokens, setHorseFinalTokens, verifyHeartbeatToken } from '../../src/db/horses.js';
import type { Horse } from '@token-derby/shared';

function makeHorse(overrides: Partial<Horse> = {}): Horse {
  return {
    horse_id: `h-${Math.random().toString(36).slice(2)}`,
    name: 'Gallopin Gary',
    colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
    current_tokens: 0,
    last_heartbeat: new Date().toISOString(),
    joined_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('horses db', () => {
  it('puts and lists horses for a race', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h1 = makeHorse();
    const h2 = makeHorse({ name: 'Prompt Pony' });
    await putHorse(race_id, h1, 'hb-token-1');
    await putHorse(race_id, h2, 'hb-token-2');
    const horses = await listHorses(race_id);
    const names = horses.map(h => h.name).sort();
    expect(names).toEqual(['Gallopin Gary', 'Prompt Pony']);
  });

  it('updates current_tokens and last_heartbeat', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse();
    await putHorse(race_id, h, 'tok');
    const now = new Date().toISOString();
    await updateHorseTokens(race_id, h.horse_id, 500, now);
    const [updated] = await listHorses(race_id);
    expect(updated?.current_tokens).toBe(500);
    expect(updated?.last_heartbeat).toBe(now);
  });

  it('sets final_tokens', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse({ current_tokens: 1200 });
    await putHorse(race_id, h, 'tok');
    await setHorseFinalTokens(race_id, h.horse_id, 1200);
    const [updated] = await listHorses(race_id);
    expect(updated?.final_tokens).toBe(1200);
  });

  it('verifies the heartbeat token', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse();
    await putHorse(race_id, h, 'secret-hb');
    expect(await verifyHeartbeatToken(race_id, h.horse_id, 'secret-hb')).toBe(true);
    expect(await verifyHeartbeatToken(race_id, h.horse_id, 'wrong')).toBe(false);
    expect(await verifyHeartbeatToken(race_id, 'no-such-horse', 'secret-hb')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/omauri/personal_projects/token_derby/api
npx vitest run test/db/horses.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/api/src/db/horses.ts`:

```typescript
import { PutCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { horseKey, parseHorseId } from './keys.js';
import type { Horse } from '@token-derby/shared';

export async function putHorse(race_id: string, horse: Horse, heartbeat_token: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...horseKey(race_id, horse.horse_id),
      ...horse,
      heartbeat_token,
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
}

export async function listHorses(race_id: string): Promise<Horse[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :hp)',
    ExpressionAttributeValues: {
      ':pk': `RACE#${race_id}`,
      ':hp': 'HORSE#',
    },
  }));
  return Items.map(pickHorse);
}

export async function updateHorseTokens(
  race_id: string,
  horse_id: string,
  current_tokens: number,
  last_heartbeat: string,
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    UpdateExpression: 'SET current_tokens = :t, last_heartbeat = :h',
    ExpressionAttributeValues: {
      ':t': current_tokens,
      ':h': last_heartbeat,
    },
    ConditionExpression: 'attribute_exists(pk)',
  }));
}

export async function setHorseFinalTokens(
  race_id: string,
  horse_id: string,
  final_tokens: number,
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    UpdateExpression: 'SET final_tokens = :f',
    ExpressionAttributeValues: { ':f': final_tokens },
  }));
}

export async function verifyHeartbeatToken(
  race_id: string,
  horse_id: string,
  heartbeat_token: string,
): Promise<boolean> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    ProjectionExpression: 'heartbeat_token',
  }));
  return Boolean(Item) && Item!.heartbeat_token === heartbeat_token;
}

export async function countHorses(race_id: string): Promise<number> {
  const { Count = 0 } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :hp)',
    ExpressionAttributeValues: {
      ':pk': `RACE#${race_id}`,
      ':hp': 'HORSE#',
    },
    Select: 'COUNT',
  }));
  return Count;
}

function pickHorse(item: Record<string, any>): Horse {
  const horse_id = parseHorseId(item.sk);
  if (!horse_id) throw new Error(`not a horse item: ${item.sk}`);
  const { pk: _pk, sk: _sk, heartbeat_token: _hb, ...rest } = item;
  return { ...rest, horse_id } as Horse;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/db/horses.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/db/horses.ts api/test/db/horses.test.ts
git commit -m "feat(api): horse DB module (put/list/update/count/verify-token)"
```

---

## Task 10: Join-code + ID generators with unit tests

**Files:**
- Create: `api/test/lib/codes.test.ts`
- Create: `api/src/lib/codes.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/api/test/lib/codes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateJoinCode, generateRaceId, generateHorseId, generateAdminCode, generateHeartbeatToken } from '../../src/lib/codes.js';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@token-derby/shared';

describe('codes', () => {
  it('generates a 6-char join code from the allowed alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      expect([...code].every(c => JOIN_CODE_ALPHABET.includes(c))).toBe(true);
    }
  });

  it('produces varied join codes', () => {
    const codes = new Set(Array.from({ length: 100 }, generateJoinCode));
    expect(codes.size).toBeGreaterThan(90);
  });

  it('generates UUID-like identifiers', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(generateRaceId()).toMatch(uuid);
    expect(generateHorseId()).toMatch(uuid);
    expect(generateAdminCode()).toMatch(uuid);
    expect(generateHeartbeatToken()).toMatch(uuid);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/lib/codes.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/api/src/lib/codes.ts`:

```typescript
import { randomBytes, randomUUID } from 'node:crypto';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@token-derby/shared';

export function generateJoinCode(): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[bytes[i]! % JOIN_CODE_ALPHABET.length];
  }
  return out;
}

export const generateRaceId = () => randomUUID();
export const generateHorseId = () => randomUUID();
export const generateAdminCode = () => randomUUID();
export const generateHeartbeatToken = () => randomUUID();
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/lib/codes.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/lib/codes.ts api/test/lib/codes.test.ts
git commit -m "feat(api): ID + join code generators"
```

---

## Task 11: Status + crashed computation with unit tests

**Files:**
- Create: `api/test/lib/status.test.ts`
- Create: `api/src/lib/status.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/api/test/lib/status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeStatus, isHorseCrashed, timeLeftSeconds } from '../../src/lib/status.js';
import type { Race } from '@token-derby/shared';

function race(overrides: Partial<Race> = {}): Race {
  return {
    race_id: 'r1',
    name: 'Test',
    start_time: '2026-04-22T09:00:00Z',
    end_time: '2026-04-22T17:00:00Z',
    tz: 'UTC',
    max_participants: 30,
    join_code: 'ABC123',
    created_at: '2026-04-22T08:00:00Z',
    ...overrides,
  };
}

describe('computeStatus', () => {
  it('returns pending before start_time', () => {
    expect(computeStatus(race(), new Date('2026-04-22T08:30:00Z'))).toBe('pending');
  });

  it('returns live between start_time and end_time', () => {
    expect(computeStatus(race(), new Date('2026-04-22T13:00:00Z'))).toBe('live');
  });

  it('returns finished at or after end_time', () => {
    expect(computeStatus(race(), new Date('2026-04-22T17:00:00Z'))).toBe('finished');
    expect(computeStatus(race(), new Date('2026-04-23T00:00:00Z'))).toBe('finished');
  });

  it('returns finished when ended_at is set, regardless of time', () => {
    const r = race({ ended_at: '2026-04-22T10:00:00Z' });
    expect(computeStatus(r, new Date('2026-04-22T11:00:00Z'))).toBe('finished');
  });
});

describe('isHorseCrashed', () => {
  const now = new Date('2026-04-22T13:00:00Z');

  it('is false if race is finished', () => {
    const r = race({ ended_at: '2026-04-22T12:00:00Z' });
    expect(isHorseCrashed(r, '2026-04-22T12:59:00Z', now)).toBe(false);
  });

  it('is true if last_heartbeat is > 120s ago and race is live', () => {
    expect(isHorseCrashed(race(), '2026-04-22T12:57:00Z', now)).toBe(true); // 180s ago
  });

  it('is false if last_heartbeat is within 120s', () => {
    expect(isHorseCrashed(race(), '2026-04-22T12:59:00Z', now)).toBe(false); // 60s ago
  });

  it('is false during pending', () => {
    const r = race({ start_time: '2026-04-22T14:00:00Z', end_time: '2026-04-22T17:00:00Z' });
    expect(isHorseCrashed(r, '2026-04-22T10:00:00Z', now)).toBe(false);
  });
});

describe('timeLeftSeconds', () => {
  it('returns seconds remaining until end_time', () => {
    const r = race();
    expect(timeLeftSeconds(r, new Date('2026-04-22T16:59:30Z'))).toBe(30);
  });

  it('returns 0 after end_time', () => {
    const r = race();
    expect(timeLeftSeconds(r, new Date('2026-04-22T17:00:01Z'))).toBe(0);
  });

  it('returns total duration before start', () => {
    const r = race();
    expect(timeLeftSeconds(r, new Date('2026-04-22T08:00:00Z'))).toBe(8 * 60 * 60);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/lib/status.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write implementation**

Create `/Users/omauri/personal_projects/token_derby/api/src/lib/status.ts`:

```typescript
import { HEARTBEAT_CRASH_TIMEOUT_MS } from '@token-derby/shared';
import type { Race, RaceStatus } from '@token-derby/shared';

export function computeStatus(race: Race, now: Date): RaceStatus {
  if (race.ended_at) return 'finished';
  const nowMs = now.getTime();
  if (nowMs >= new Date(race.end_time).getTime()) return 'finished';
  if (nowMs < new Date(race.start_time).getTime()) return 'pending';
  return 'live';
}

export function isHorseCrashed(race: Race, last_heartbeat: string, now: Date): boolean {
  if (computeStatus(race, now) !== 'live') return false;
  return now.getTime() - new Date(last_heartbeat).getTime() > HEARTBEAT_CRASH_TIMEOUT_MS;
}

export function timeLeftSeconds(race: Race, now: Date): number {
  const delta = new Date(race.end_time).getTime() - now.getTime();
  return Math.max(0, Math.floor(delta / 1000));
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/lib/status.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/lib/status.ts api/test/lib/status.test.ts
git commit -m "feat(api): status + crash + time-left computations"
```

---

## Task 12: HTTP response helpers

**Files:**
- Create: `api/src/lib/http.ts`

- [ ] **Step 1: Write http.ts**

Create `/Users/omauri/personal_projects/token_derby/api/src/lib/http.ts`:

```typescript
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ErrorCode } from '@token-derby/shared';
import { ERROR_STATUS } from '@token-derby/shared';

export function ok<T>(body: T, status = 200): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function err(code: ErrorCode, message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: ERROR_STATUS[code],
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, message }),
  };
}

export function parseJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/src/lib/http.ts
git commit -m "feat(api): Lambda response + JSON helpers"
```

---

## Task 13: createRace handler with tests

**Files:**
- Create: `api/test/handlers/create-race.test.ts`
- Create: `api/src/handlers/create-race.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/api/test/handlers/create-race.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { handler } from '../../src/handlers/create-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getRaceByJoinCode, getRaceByAdminCode } from '../../src/db/races.js';

function event(body: unknown): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /races',
    rawPath: '/races',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('createRace handler', () => {
  it('creates a race and returns join + admin codes', async () => {
    const res: any = await handler(event({
      name: 'Test Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
    }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.race_id).toBeTruthy();
    expect(body.join_code).toMatch(/^[A-Z0-9]{6}$/);
    expect(body.admin_code).toMatch(/^[0-9a-f-]{36}$/);

    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.name).toBe('Test Derby');
    expect(race?.max_participants).toBe(30);

    const raceByAdmin = await getRaceByAdminCode(body.admin_code);
    expect(raceByAdmin?.race_id).toBe(body.race_id);
  });

  it('respects custom max_participants', async () => {
    const res: any = await handler(event({
      name: 'Small Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      max_participants: 5,
    }));
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.max_participants).toBe(5);
  });

  it('rejects missing fields with BAD_REQUEST', async () => {
    const res: any = await handler(event({ name: 'No times' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('rejects end_time before start_time', async () => {
    const res: any = await handler(event({
      name: 'Backwards',
      start_time: '2026-04-22T17:00:00Z',
      end_time: '2026-04-22T09:00:00Z',
      tz: 'UTC',
    }));
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/handlers/create-race.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write handler**

Create `/Users/omauri/personal_projects/token_derby/api/src/handlers/create-race.ts`:

```typescript
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { CreateRaceRequest, CreateRaceResponse } from '@token-derby/shared';
import { DEFAULT_MAX_PARTICIPANTS } from '@token-derby/shared';
import { generateRaceId, generateJoinCode, generateAdminCode } from '../lib/codes.js';
import { putRace, getRaceByJoinCode } from '../db/races.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const body = parseJson<CreateRaceRequest>(event.body);
  if (!body) return err('BAD_REQUEST', 'JSON body required');

  if (
    !body.name ||
    !body.start_time ||
    !body.end_time ||
    !body.tz ||
    typeof body.name !== 'string' ||
    typeof body.start_time !== 'string' ||
    typeof body.end_time !== 'string'
  ) {
    return err('BAD_REQUEST', 'name, start_time, end_time, tz are required');
  }

  if (new Date(body.end_time).getTime() <= new Date(body.start_time).getTime()) {
    return err('BAD_REQUEST', 'end_time must be after start_time');
  }

  const join_code = await findUniqueJoinCode();
  const race_id = generateRaceId();
  const admin_code = generateAdminCode();

  await putRace(
    {
      race_id,
      name: body.name,
      start_time: body.start_time,
      end_time: body.end_time,
      tz: body.tz,
      max_participants: body.max_participants ?? DEFAULT_MAX_PARTICIPANTS,
      join_code,
      created_at: new Date().toISOString(),
    },
    admin_code,
  );

  const response: CreateRaceResponse = { race_id, join_code, admin_code };
  return ok(response);
};

async function findUniqueJoinCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateJoinCode();
    const existing = await getRaceByJoinCode(code);
    if (!existing) return code;
  }
  throw new Error('Could not generate unique join code after 10 attempts');
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/handlers/create-race.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/handlers/create-race.ts api/test/handlers/create-race.test.ts
git commit -m "feat(api): createRace handler"
```

---

## Task 14: joinRace handler with tests

**Files:**
- Create: `api/test/handlers/join-race.test.ts`
- Create: `api/src/handlers/join-race.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/api/test/handlers/join-race.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';
import { setRaceEnded } from '../../src/db/races.js';
import { getRaceByJoinCode } from '../../src/db/races.js';

async function createTestRace(overrides: Record<string, any> = {}) {
  const res: any = await createHandler(createEvent({
    name: 'Join Test',
    start_time: '2026-04-22T09:00:00Z',
    end_time: '2026-04-22T17:00:00Z',
    tz: 'UTC',
    ...overrides,
  }));
  return JSON.parse(res.body);
}

function createEvent(body: unknown): APIGatewayProxyEventV2 {
  return { version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '', headers: {}, requestContext: {} as any, body: JSON.stringify(body), isBase64Encoded: false };
}

function joinEvent(join_code: string, body: unknown): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /races/{join_code}/join',
    rawPath: `/races/${join_code}/join`,
    rawQueryString: '',
    pathParameters: { join_code },
    headers: {},
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

const validHorse = {
  horse: {
    name: 'Gary',
    colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
  },
};

describe('joinRace handler', () => {
  it('joins a race and returns horse_id + heartbeat_token', async () => {
    const { join_code, race_id } = await createTestRace();
    const res: any = await joinHandler(joinEvent(join_code, validHorse));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horse_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.heartbeat_token).toMatch(/^[0-9a-f-]{36}$/);

    const horses = await listHorses(race_id);
    expect(horses).toHaveLength(1);
    expect(horses[0]?.name).toBe('Gary');
  });

  it('returns RACE_NOT_FOUND for unknown code', async () => {
    const res: any = await joinHandler(joinEvent('NOPE99', validHorse));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('RACE_NOT_FOUND');
  });

  it('returns RACE_FINISHED when ended', async () => {
    const { join_code, race_id } = await createTestRace();
    await setRaceEnded(race_id, new Date().toISOString());
    const res: any = await joinHandler(joinEvent(join_code, validHorse));
    expect(res.statusCode).toBe(410);
    expect(JSON.parse(res.body).code).toBe('RACE_FINISHED');
  });

  it('returns RACE_FULL when at capacity', async () => {
    const { join_code } = await createTestRace({ max_participants: 2 });
    await joinHandler(joinEvent(join_code, validHorse));
    await joinHandler(joinEvent(join_code, validHorse));
    const res: any = await joinHandler(joinEvent(join_code, validHorse));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('RACE_FULL');
  });

  it('rejects missing horse fields', async () => {
    const { join_code } = await createTestRace();
    const res: any = await joinHandler(joinEvent(join_code, { horse: { name: 'x' } }));
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/handlers/join-race.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write handler**

Create `/Users/omauri/personal_projects/token_derby/api/src/handlers/join-race.ts`:

```typescript
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { JoinRaceRequest, JoinRaceResponse } from '@token-derby/shared';
import { generateHorseId, generateHeartbeatToken } from '../lib/codes.js';
import { getRaceByJoinCode } from '../db/races.js';
import { putHorse, countHorses } from '../db/horses.js';
import { computeStatus } from '../lib/status.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code path parameter required');

  const body = parseJson<JoinRaceRequest>(event.body);
  if (!body?.horse?.name || !body.horse.colors) {
    return err('BAD_REQUEST', 'horse.name and horse.colors required');
  }
  const c = body.horse.colors;
  if (!c.body || !c.mane || !c.tail || !c.saddle) {
    return err('BAD_REQUEST', 'horse.colors.body/mane/tail/saddle required');
  }

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);
  if (computeStatus(race, new Date()) === 'finished') {
    return err('RACE_FINISHED', 'This race has ended');
  }

  const existing = await countHorses(race.race_id);
  if (existing >= race.max_participants) {
    return err('RACE_FULL', `This race is full (${race.max_participants}/${race.max_participants} horses)`);
  }

  const horse_id = generateHorseId();
  const heartbeat_token = generateHeartbeatToken();
  const now = new Date().toISOString();

  await putHorse(
    race.race_id,
    {
      horse_id,
      name: body.horse.name,
      colors: body.horse.colors,
      current_tokens: 0,
      last_heartbeat: now,
      joined_at: now,
    },
    heartbeat_token,
  );

  const response: JoinRaceResponse = { horse_id, heartbeat_token };
  return ok(response);
};
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/handlers/join-race.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/handlers/join-race.ts api/test/handlers/join-race.test.ts
git commit -m "feat(api): joinRace handler"
```

---

## Task 15: heartbeat handler with tests

**Files:**
- Create: `api/test/handlers/heartbeat.test.ts`
- Create: `api/src/handlers/heartbeat.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/api/test/handlers/heartbeat.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';

async function setup() {
  const createRes: any = await createHandler({
    version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '', headers: {}, requestContext: {} as any, isBase64Encoded: false,
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
    pathParameters: { join_code }, headers: {}, requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify({ horse: { name: 'Gary', colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' } } }),
  });
  const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
  return { join_code, race_id, horse_id, heartbeat_token };
}

function hbEvent(join_code: string, horse_id: string, heartbeat_token: string | null, body: unknown): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /races/{join_code}/horses/{horse_id}/heartbeat',
    rawPath: `/races/${join_code}/horses/${horse_id}/heartbeat`,
    rawQueryString: '',
    pathParameters: { join_code, horse_id },
    headers: heartbeat_token ? { authorization: `Bearer ${heartbeat_token}` } : {},
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('heartbeat handler', () => {
  it('updates current_tokens and last_heartbeat', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { current_tokens: 1234 }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.race_status).toBe('live');
    expect(typeof body.server_time).toBe('string');
    expect(typeof body.time_left_seconds).toBe('number');

    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(1234);
  });

  it('rejects wrong heartbeat token', async () => {
    const { join_code, horse_id } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, 'wrong-token', { current_tokens: 1 }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('INVALID_TOKEN');
  });

  it('rejects missing authorization header', async () => {
    const { join_code, horse_id } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, null, { current_tokens: 1 }));
    expect(res.statusCode).toBe(401);
  });

  it('rejects negative current_tokens', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { current_tokens: -5 }));
    expect(res.statusCode).toBe(400);
  });

  it('returns RACE_NOT_FOUND for unknown code', async () => {
    const res: any = await hbHandler(hbEvent('NOPE99', 'no-horse', 'tok', { current_tokens: 0 }));
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/handlers/heartbeat.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write handler**

Create `/Users/omauri/personal_projects/token_derby/api/src/handlers/heartbeat.ts`:

```typescript
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { HeartbeatRequest, HeartbeatResponse } from '@token-derby/shared';
import { getRaceByJoinCode } from '../db/races.js';
import { verifyHeartbeatToken, updateHorseTokens } from '../db/horses.js';
import { computeStatus, timeLeftSeconds } from '../lib/status.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  const horse_id = event.pathParameters?.horse_id;
  if (!join_code || !horse_id) return err('BAD_REQUEST', 'path params required');

  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return err('INVALID_TOKEN', 'Authorization: Bearer required');

  const body = parseJson<HeartbeatRequest>(event.body);
  if (!body || typeof body.current_tokens !== 'number' || body.current_tokens < 0) {
    return err('BAD_REQUEST', 'current_tokens (non-negative number) required');
  }

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  const verified = await verifyHeartbeatToken(race.race_id, horse_id, token);
  if (!verified) return err('INVALID_TOKEN', 'heartbeat token does not match');

  const now = new Date();
  await updateHorseTokens(race.race_id, horse_id, body.current_tokens, now.toISOString());

  const response: HeartbeatResponse = {
    race_status: computeStatus(race, now),
    server_time: now.toISOString(),
    time_left_seconds: timeLeftSeconds(race, now),
  };
  return ok(response);
};
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/handlers/heartbeat.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/handlers/heartbeat.ts api/test/handlers/heartbeat.test.ts
git commit -m "feat(api): heartbeat handler"
```

---

## Task 16: getRace handler with tests (rank + crashed computation)

**Files:**
- Create: `api/test/handlers/get-race.test.ts`
- Create: `api/src/handlers/get-race.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/api/test/handlers/get-race.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { handler as getRaceHandler } from '../../src/handlers/get-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function evt(body: unknown, path: string, routeKey: string, pathParams?: Record<string, string>, auth?: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey, rawPath: path, rawQueryString: '',
    pathParameters: pathParams,
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
    requestContext: {} as any,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

describe('getRace handler', () => {
  async function setupRace() {
    const createRes: any = await createHandler(evt({
      name: 'GetRace Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }, '/races', 'POST /races'));
    return JSON.parse(createRes.body);
  }

  async function joinH(join_code: string, name: string) {
    const res: any = await joinHandler(evt(
      { horse: { name, colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' } } },
      `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code },
    ));
    return JSON.parse(res.body);
  }

  async function hb(join_code: string, horse_id: string, tok: string, current_tokens: number) {
    await hbHandler(evt({ current_tokens }, `/races/${join_code}/horses/${horse_id}/heartbeat`, 'POST /races/{join_code}/horses/{horse_id}/heartbeat', { join_code, horse_id }, tok));
  }

  it('returns 404 for unknown join code', async () => {
    const res: any = await getRaceHandler(evt(null, '/races/NOPE99', 'GET /races/{join_code}', { join_code: 'NOPE99' }));
    expect(res.statusCode).toBe(404);
  });

  it('returns race with horses, ranked by current_tokens desc', async () => {
    const { join_code } = await setupRace();
    const a = await joinH(join_code, 'Alpha');
    const b = await joinH(join_code, 'Beta');
    const c = await joinH(join_code, 'Gamma');
    await hb(join_code, a.horse_id, a.heartbeat_token, 100);
    await hb(join_code, b.horse_id, b.heartbeat_token, 500);
    await hb(join_code, c.horse_id, c.heartbeat_token, 300);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horses).toHaveLength(3);
    expect(body.horses.map((h: any) => [h.name, h.rank]).sort()).toEqual([['Alpha', 3], ['Beta', 1], ['Gamma', 2]]);
    expect(body.status).toBe('live');
    expect(typeof body.server_time).toBe('string');
    expect(typeof body.time_left_seconds).toBe('number');
  });

  it('marks horse as crashed when last_heartbeat > 120s ago', async () => {
    const { join_code, race_id } = await setupRace();
    const a = await joinH(join_code, 'Alpha');
    await hb(join_code, a.horse_id, a.heartbeat_token, 100);

    // Age the horse's last_heartbeat to 180s ago by directly updating via the update helper
    const { updateHorseTokens } = await import('../../src/db/horses.js');
    await updateHorseTokens(race_id, a.horse_id, 100, new Date(Date.now() - 180_000).toISOString());

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    expect(body.horses[0].crashed).toBe(true);
  });

  it('does not mark crashed during pending', async () => {
    const createRes: any = await createHandler(evt({
      name: 'Future race',
      start_time: new Date(Date.now() + 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }, '/races', 'POST /races'));
    const { join_code } = JSON.parse(createRes.body);
    const a = await joinH(join_code, 'Alpha');
    await hb(join_code, a.horse_id, a.heartbeat_token, 0);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    expect(body.status).toBe('pending');
    expect(body.horses[0].crashed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/handlers/get-race.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write handler**

Create `/Users/omauri/personal_projects/token_derby/api/src/handlers/get-race.ts`:

```typescript
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { GetRaceResponse, Horse, HorseView, RaceStatus } from '@token-derby/shared';
import { getRaceByJoinCode, setRaceEnded } from '../db/races.js';
import { listHorses } from '../db/horses.js';
import { computeStatus, isHorseCrashed, timeLeftSeconds } from '../lib/status.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code required');

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  const now = new Date();
  let status: RaceStatus = computeStatus(race, now);

  // Lazy persist ended_at the first time end_time is crossed
  if (status === 'finished' && !race.ended_at) {
    const iso = now.toISOString();
    await setRaceEnded(race.race_id, iso);
    race.ended_at = iso;
  }

  const horses = await listHorses(race.race_id);
  const ranked = rankHorses(horses, race, now);

  const response: GetRaceResponse = {
    race_id: race.race_id,
    name: race.name,
    start_time: race.start_time,
    end_time: race.end_time,
    tz: race.tz,
    max_participants: race.max_participants,
    join_code: race.join_code,
    created_at: race.created_at,
    ended_at: race.ended_at,
    status,
    horses: ranked,
    server_time: now.toISOString(),
    time_left_seconds: timeLeftSeconds(race, now),
  };
  return ok(response);
};

function rankHorses(horses: Horse[], race: Parameters<typeof computeStatus>[0], now: Date): HorseView[] {
  const sorted = [...horses].sort((a, b) => {
    if (b.current_tokens !== a.current_tokens) return b.current_tokens - a.current_tokens;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });
  return sorted.map((h, i) => ({
    ...h,
    rank: i + 1,
    crashed: isHorseCrashed(race, h.last_heartbeat, now),
  }));
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/handlers/get-race.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/handlers/get-race.ts api/test/handlers/get-race.test.ts
git commit -m "feat(api): getRace handler with ranking and crash computation"
```

---

## Task 17: endRace handler with tests

**Files:**
- Create: `api/test/handlers/end-race.test.ts`
- Create: `api/src/handlers/end-race.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/omauri/personal_projects/token_derby/api/test/handlers/end-race.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { handler as endHandler } from '../../src/handlers/end-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';
import { getRaceById } from '../../src/db/races.js';

function evt(body: unknown, path: string, routeKey: string, pathParams?: Record<string, string>, auth?: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey, rawPath: path, rawQueryString: '',
    pathParameters: pathParams,
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
    requestContext: {} as any,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

describe('endRace handler', () => {
  it('ends the race and freezes final_tokens', async () => {
    const createRes: any = await createHandler(evt({
      name: 'End Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }, '/races', 'POST /races'));
    const { join_code, race_id, admin_code } = JSON.parse(createRes.body);

    const joinRes: any = await joinHandler(evt(
      { horse: { name: 'Gary', colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' } } },
      `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code },
    ));
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    await hbHandler(evt({ current_tokens: 777 },
      `/races/${join_code}/horses/${horse_id}/heartbeat`,
      'POST /races/{join_code}/horses/{horse_id}/heartbeat',
      { join_code, horse_id }, heartbeat_token,
    ));

    const res: any = await endHandler(evt(null, `/races/admin/${admin_code}`, 'DELETE /races/admin/{admin_code}', { admin_code }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    const race = await getRaceById(race_id);
    expect(race?.ended_at).toBeTruthy();
    const horses = await listHorses(race_id);
    expect(horses[0]?.final_tokens).toBe(777);
  });

  it('returns RACE_NOT_FOUND for unknown admin_code', async () => {
    const res: any = await endHandler(evt(null, '/races/admin/no-such', 'DELETE /races/admin/{admin_code}', { admin_code: 'no-such' }));
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run test/handlers/end-race.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write handler**

Create `/Users/omauri/personal_projects/token_derby/api/src/handlers/end-race.ts`:

```typescript
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { EndRaceResponse } from '@token-derby/shared';
import { getRaceByAdminCode, setRaceEnded } from '../db/races.js';
import { listHorses, setHorseFinalTokens } from '../db/horses.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const admin_code = event.pathParameters?.admin_code;
  if (!admin_code) return err('BAD_REQUEST', 'admin_code required');

  const race = await getRaceByAdminCode(admin_code);
  if (!race) return err('RACE_NOT_FOUND', 'No race for that admin code');

  if (!race.ended_at) {
    await setRaceEnded(race.race_id, new Date().toISOString());
  }

  const horses = await listHorses(race.race_id);
  await Promise.all(
    horses
      .filter(h => h.final_tokens === undefined)
      .map(h => setHorseFinalTokens(race.race_id, h.horse_id, h.current_tokens)),
  );

  const response: EndRaceResponse = { ok: true };
  return ok(response);
};
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/handlers/end-race.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add api/src/handlers/end-race.ts api/test/handlers/end-race.test.ts
git commit -m "feat(api): endRace handler"
```

---

## Task 18: Run full API test suite

- [ ] **Step 1: Ensure DynamoDB Local is running, then run everything**

```bash
cd /Users/omauri/personal_projects/token_derby
make dynamodb-up
cd api
npx vitest run
```

Expected: All test files pass. Count roughly 40+ tests green.

- [ ] **Step 2: If any test fails, fix the underlying cause**

Do not mask failures with conditionals. If a test is flaky because of DynamoDB Local state leaking between files, reduce parallelism with `--pool=threads --poolOptions.threads.singleThread=true` or switch to `--no-file-parallelism`. Investigate root cause before working around.

---

## Task 19: Initialize CDK infra package

**Files:**
- Create: `infra/package.json`
- Create: `infra/tsconfig.json`
- Create: `infra/cdk.json`
- Create: `infra/bin/token-derby.ts`
- Create: `infra/site-placeholder/index.html`

- [ ] **Step 1: Write infra/package.json**

Create `/Users/omauri/personal_projects/token_derby/infra/package.json`:

```json
{
  "name": "@token-derby/infra",
  "version": "0.1.0",
  "private": true,
  "bin": {
    "token-derby-infra": "bin/token-derby.js"
  },
  "scripts": {
    "build": "tsc -p .",
    "synth": "cdk synth",
    "deploy": "cdk deploy --require-approval never",
    "diff": "cdk diff",
    "destroy": "cdk destroy"
  },
  "dependencies": {
    "@token-derby/shared": "*",
    "aws-cdk-lib": "^2.160.0",
    "constructs": "^10.3.0"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "aws-cdk": "^2.160.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write infra/tsconfig.json**

Create `/Users/omauri/personal_projects/token_derby/infra/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "module": "commonjs",
    "moduleResolution": "node",
    "rootDir": "."
  },
  "include": ["bin/**/*", "lib/**/*"]
}
```

Note: CDK uses CommonJS; override the base config for this package only.

- [ ] **Step 3: Write infra/cdk.json**

Create `/Users/omauri/personal_projects/token_derby/infra/cdk.json`:

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/token-derby.ts",
  "context": {
    "@aws-cdk/core:newStyleStackSynthesis": true,
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/aws-iam:minimizePolicies": true,
    "@aws-cdk/core:stackRelativeExports": true,
    "@aws-cdk/aws-cloudfront:defaultSecurityPolicyTLSv1.2_2021": true
  }
}
```

- [ ] **Step 4: Write infra/bin/token-derby.ts**

Create `/Users/omauri/personal_projects/token_derby/infra/bin/token-derby.ts`:

```typescript
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TokenDerbyStack } from '../lib/token-derby-stack';

const app = new cdk.App();

new TokenDerbyStack(app, 'TokenDerbyStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-2',
  },
  crossRegionReferences: true,
});
```

- [ ] **Step 5: Write placeholder site**

Create `/Users/omauri/personal_projects/token_derby/infra/site-placeholder/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Token Derby</title>
    <style>
      body { font-family: "Courier New", monospace; background: #1a1229; color: #ffd166; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
      h1 { font-size: 2em; }
      p { color: #a68bd8; }
    </style>
  </head>
  <body>
    <div style="text-align:center">
      <h1>Token Derby</h1>
      <p>Track under construction. Site UI ships in Plan 3.</p>
    </div>
  </body>
</html>
```

- [ ] **Step 6: Install deps**

```bash
cd /Users/omauri/personal_projects/token_derby
npm install
```

- [ ] **Step 7: Commit**

```bash
git add infra/ package-lock.json
git commit -m "chore(infra): scaffold CDK app (no stack body yet)"
```

---

## Task 20: Write the CDK stack

**Files:**
- Create: `infra/lib/token-derby-stack.ts`

- [ ] **Step 1: Add the NodejsFunction dependency**

Modify `/Users/omauri/personal_projects/token_derby/infra/package.json` — add to `devDependencies`:

```json
"esbuild": "^0.23.0"
```

Then reinstall:

```bash
cd /Users/omauri/personal_projects/token_derby
npm install
```

- [ ] **Step 2: Write the stack**

Create `/Users/omauri/personal_projects/token_derby/infra/lib/token-derby-stack.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as path from 'path';

const DOMAIN_NAME = 'token-derby.mauricode.co.uk';
const HOSTED_ZONE_DOMAIN = 'mauricode.co.uk';
const TABLE_NAME = 'token-derby';

export class TokenDerbyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // ── Route 53 + ACM (cert must live in us-east-1 for CloudFront) ────
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: HOSTED_ZONE_DOMAIN,
    });

    const certificate = new acm.DnsValidatedCertificate(this, 'Certificate', {
      domainName: DOMAIN_NAME,
      hostedZone,
      region: 'us-east-1',
    });

    // ── DynamoDB single table ──────────────────────────────────────────
    const table = new dynamodb.Table(this, 'TokenDerbyTable', {
      tableName: TABLE_NAME,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'JoinCodeIndex',
      partitionKey: { name: 'join_code', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'AdminCodeIndex',
      partitionKey: { name: 'admin_code', type: dynamodb.AttributeType.STRING },
    });

    // ── Lambda factory ─────────────────────────────────────────────────
    const apiDir = path.resolve(__dirname, '..', '..', 'api', 'src', 'handlers');
    const commonEnv = { TABLE_NAME, NODE_OPTIONS: '--enable-source-maps' };

    const makeFn = (name: string, fileBase: string) => {
      const fn = new NodejsFunction(this, name, {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(apiDir, `${fileBase}.ts`),
        handler: 'handler',
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        environment: commonEnv,
        bundling: {
          target: 'node22',
          sourceMap: true,
          externalModules: ['@aws-sdk/*'],
        },
      });
      table.grantReadWriteData(fn);
      return fn;
    };

    const createRaceFn = makeFn('CreateRaceFn', 'create-race');
    const getRaceFn = makeFn('GetRaceFn', 'get-race');
    const joinRaceFn = makeFn('JoinRaceFn', 'join-race');
    const heartbeatFn = makeFn('HeartbeatFn', 'heartbeat');
    const endRaceFn = makeFn('EndRaceFn', 'end-race');

    // ── HTTP API Gateway ───────────────────────────────────────────────
    const httpApi = new HttpApi(this, 'TokenDerbyApi', {
      apiName: 'token-derby-api',
      corsPreflight: {
        allowOrigins: [`https://${DOMAIN_NAME}`, 'http://localhost:5173'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type', 'authorization'],
      },
    });

    httpApi.addRoutes({ path: '/api/races', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('CreateRaceInt', createRaceFn) });
    httpApi.addRoutes({ path: '/api/races/{join_code}', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('GetRaceInt', getRaceFn) });
    httpApi.addRoutes({ path: '/api/races/{join_code}/join', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('JoinRaceInt', joinRaceFn) });
    httpApi.addRoutes({ path: '/api/races/{join_code}/horses/{horse_id}/heartbeat', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('HeartbeatInt', heartbeatFn) });
    httpApi.addRoutes({ path: '/api/races/admin/{admin_code}', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('EndRaceInt', endRaceFn) });

    // API throttling (rate-limit guardrails, not hard security)
    const defaultStage = httpApi.defaultStage!.node.defaultChild as cdk.aws_apigatewayv2.CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingBurstLimit: 50,
      throttlingRateLimit: 20,
    };

    // ── Static site bucket (populated in Plan 3) ──────────────────────
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new s3deploy.BucketDeployment(this, 'DeployPlaceholder', {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, '..', 'site-placeholder'))],
      destinationBucket: siteBucket,
    });

    // ── CloudFront with /api/* proxy to API Gateway ───────────────────
    const apiUrl = cdk.Fn.select(1, cdk.Fn.split('://', httpApi.url!));
    const apiDomain = cdk.Fn.select(0, cdk.Fn.split('/', apiUrl));
    const apiOrigin = new origins.HttpOrigin(apiDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      domainNames: [DOMAIN_NAME],
      certificate: certificate as unknown as acm.ICertificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    // ── Outputs ────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${DOMAIN_NAME}` });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', { value: httpApi.url! });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
```

- [ ] **Step 3: Synth to confirm the stack compiles**

```bash
cd /Users/omauri/personal_projects/token_derby/infra
npx cdk synth
```

Expected: synth succeeds (or prompts for AWS credentials if not configured). The template is printed on success.

Troubleshoot: if the `format: 'esm'` bundling option errors because of `@aws-sdk` CJS mismatch, drop that line and allow NodejsFunction to emit CJS — the handlers' `.ts` source uses ESM syntax but esbuild will transpile it.

- [ ] **Step 4: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add infra/
git commit -m "feat(infra): CDK stack — DynamoDB, Lambdas, API Gateway, CloudFront, Route53"
```

---

## Task 21: First deploy

- [ ] **Step 1: Verify AWS credentials**

Run:

```bash
aws sts get-caller-identity
```

Expected: JSON with your account ID. If not, set up credentials before continuing.

- [ ] **Step 2: Bootstrap CDK in eu-west-2 and us-east-1**

```bash
cd /Users/omauri/personal_projects/token_derby/infra
npx cdk bootstrap aws://<account-id>/eu-west-2
npx cdk bootstrap aws://<account-id>/us-east-1
```

Replace `<account-id>` with your actual AWS account ID. Both regions are required because the ACM cert is cross-region.

- [ ] **Step 3: Deploy the stack**

```bash
npx cdk deploy --require-approval never
```

Expected: ~5-10 minutes on first deploy (CloudFront distribution takes the longest). Outputs printed at the end:

```
TokenDerbyStack.ApiGatewayUrl = https://xxxxx.execute-api.eu-west-2.amazonaws.com/
TokenDerbyStack.DistributionId = E123...
TokenDerbyStack.SiteUrl = https://token-derby.mauricode.co.uk
TokenDerbyStack.TableName = token-derby
```

- [ ] **Step 4: Verify DNS propagation**

```bash
dig +short token-derby.mauricode.co.uk
```

Expected: a CloudFront domain (e.g. `d1a2b3c4d5e6f7.cloudfront.net`).

- [ ] **Step 5: Verify the placeholder site loads**

```bash
curl -sI https://token-derby.mauricode.co.uk/ | head -5
```

Expected: `HTTP/2 200` with `content-type: text/html`.

- [ ] **Step 6: No commit needed** — nothing changed in the repo for this task; this is a deployment-only step.

---

## Task 22: Smoke-test the deployed API

- [ ] **Step 1: Create a race**

```bash
curl -sX POST https://token-derby.mauricode.co.uk/api/races \
  -H "content-type: application/json" \
  -d '{
    "name": "Smoke Test",
    "start_time": "'"$(date -u -v-1M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 minute ago' +%Y-%m-%dT%H:%M:%SZ)"'",
    "end_time":   "'"$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 hour' +%Y-%m-%dT%H:%M:%SZ)"'",
    "tz": "Europe/London"
  }' | tee /tmp/td-race.json
```

Expected: JSON with `race_id`, `join_code`, `admin_code`.

- [ ] **Step 2: Join as a horse**

```bash
JOIN=$(jq -r .join_code /tmp/td-race.json)
curl -sX POST https://token-derby.mauricode.co.uk/api/races/$JOIN/join \
  -H "content-type: application/json" \
  -d '{"horse":{"name":"SmokeHorse","colors":{"body":"#8B4513","mane":"#000","tail":"#000","saddle":"#C0392B"}}}' \
  | tee /tmp/td-horse.json
```

Expected: JSON with `horse_id` and `heartbeat_token`.

- [ ] **Step 3: Send a heartbeat**

```bash
HORSE=$(jq -r .horse_id /tmp/td-horse.json)
TOKEN=$(jq -r .heartbeat_token /tmp/td-horse.json)
curl -sX POST https://token-derby.mauricode.co.uk/api/races/$JOIN/horses/$HORSE/heartbeat \
  -H "content-type: application/json" \
  -H "authorization: Bearer $TOKEN" \
  -d '{"current_tokens":1500}'
```

Expected: JSON with `race_status: "live"` and a positive `time_left_seconds`.

- [ ] **Step 4: Read race state**

```bash
curl -s https://token-derby.mauricode.co.uk/api/races/$JOIN | jq .
```

Expected: full race view with one horse at `current_tokens: 1500, rank: 1, crashed: false`.

- [ ] **Step 5: End the race**

```bash
ADMIN=$(jq -r .admin_code /tmp/td-race.json)
curl -sX DELETE https://token-derby.mauricode.co.uk/api/races/admin/$ADMIN
```

Expected: `{"ok":true}`.

- [ ] **Step 6: Confirm status is finished**

```bash
curl -s https://token-derby.mauricode.co.uk/api/races/$JOIN | jq '.status, .horses[0].final_tokens'
```

Expected: `"finished"` and `1500`.

- [ ] **Step 7: No commit needed** — smoke test only.

---

## Task 23: Write project README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

Create `/Users/omauri/personal_projects/token_derby/README.md`:

```markdown
# Token Derby

A pixel-art daily horse race where each horse is a participant and every length gained is an output token their Claude Code produced. One-shot races, scheduled start/end times, customizable horses, terminal-as-life-support (close the terminal → your horse crashes).

- **Site:** https://token-derby.mauricode.co.uk
- **Spec:** `docs/superpowers/specs/2026-04-21-token-derby-design.md`

## Project layout

- `shared/` — domain types, API contracts, error codes, constants
- `api/` — Lambda handlers (`createRace`, `getRace`, `joinRace`, `heartbeat`, `endRace`)
- `infra/` — AWS CDK stack (eu-west-2, with cross-region ACM in us-east-1)
- `cli/` — `@mauricode/token-derby` npm package (shipped in Plan 2)
- `site/` — static race viewer (shipped in Plan 3)

## Local development

```bash
# 1. Install
npm install

# 2. Start DynamoDB Local
make dynamodb-up

# 3. Run tests
npm test

# 4. Stop DynamoDB Local
make dynamodb-down
```

## Deploy

Requires AWS credentials for an account where `mauricode.co.uk` is hosted in Route 53.

```bash
cd infra
npx cdk bootstrap aws://<account>/eu-west-2
npx cdk bootstrap aws://<account>/us-east-1
npx cdk deploy
```

## API (base: `https://token-derby.mauricode.co.uk/api`)

```
POST   /races                                              -> create a race
GET    /races/{join_code}                                  -> race view (polled by site / CLI)
POST   /races/{join_code}/join                             -> register a horse
POST   /races/{join_code}/horses/{horse_id}/heartbeat      -> update current_tokens
DELETE /races/admin/{admin_code}                           -> end the race
```

See the spec for request/response shapes and error envelopes.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/omauri/personal_projects/token_derby
git add README.md
git commit -m "docs: add README"
```

---

## Done — what Plan 1 produced

- Monorepo with `shared/`, `api/`, `infra/` packages
- Typed, tested API handlers behind API Gateway + Lambda
- DynamoDB single table with GSIs, deployed in `eu-west-2`
- CloudFront distribution at `https://token-derby.mauricode.co.uk` with `/api/*` proxying to API Gateway and `/` serving a placeholder page
- Smoke-tested end-to-end via curl
- README + committed spec

**Plan 2 (CLI)** picks up from here — the CLI talks to the API you just shipped. **Plan 3 (Site)** drops real HTML/JS into the S3 bucket that's already wired up.
