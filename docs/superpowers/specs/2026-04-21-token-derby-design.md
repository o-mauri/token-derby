# Token Derby — Design

**Status:** Approved for planning
**Date:** 2026-04-21
**Owner:** omar@stackone.com

## Overview

Token Derby is a fun, single-org-scale web app where team members run horses in a daily race. Each horse represents a participant; horse movement is driven by Claude Code output tokens the participant generates during the race window. Races are created and joined from a CLI; the website is a read-only spectator view.

Pixel-art aesthetic. No user accounts. Infra hosted in AWS, deployed via CDK.

## Goals

- A short-lived (hours), single-occurrence race per `token-derby create` invocation
- Participants customize and reuse horses from a local stable
- Real-enough time race view (3s polling is plenty)
- Zero-account friction — knowledge of a race code is the only credential
- Cheap to run at idle (serverless, scales to near-zero)
- Shares domain and deployment pattern with sibling projects (`mauricode.co.uk` subdomain, CDK, CloudFront + S3 + API Gateway + Lambda + DynamoDB)

## Non-goals

- Accounts / login / SSO
- Multi-day or recurring races
- Cross-machine horse storage (stable stays local)
- Cheating prevention beyond honor-system (scope B — few-hundred-person org)
- Real-time (WebSocket) live updates — 3s polling is sufficient
- Historical analytics, leaderboards across races, betting, bot integrations
- Horse accessories beyond the 4 color slots (body / mane / tail / saddle)

## Architecture

Five components. Single CDK stack in `eu-west-2`, with ACM cert cross-region in `us-east-1` for CloudFront.

```
┌─ Client ────────────┐      ┌─ AWS (eu-west-2, cert in us-east-1) ────────┐
│                     │      │                                              │
│  token-derby CLI    │─────▶│  CloudFront ── S3 (static site)             │
│  (Node.js)          │      │      │                                       │
│                     │      │      └── /api/* ──▶ API Gateway (HTTP API)  │
│  Browser            │─────▶│                         │                    │
│  (race viewer)      │      │                         ▼                    │
│                     │      │                      Lambda (5 handlers)     │
└─────────────────────┘      │                         │                    │
                              │                         ▼                    │
                              │                      DynamoDB (single table)│
                              └──────────────────────────────────────────────┘
```

### Responsibilities

| Component | Owns |
|---|---|
| **CLI (`token-derby`)** | Local stable (`~/.token-derby/stable.json`). Reading Claude Code transcripts. Heartbeat loop. Active-race state (`~/.token-derby/active-races/<join_code>.json`). |
| **API (Lambda)** | Race creation/teardown. Authoritative horse state. Crash state computed on read (not stored). |
| **Site (S3 + CloudFront)** | Rendering + animation only. All derived state (positions, ranks, crashed flag) comes from `GET /races/<code>`. |
| **DynamoDB** | Race meta + horse rows. Single-table, GSIs on `join_code` and `admin_code`. |

### Key properties

- **No accounts.** Authorization = knowledge of `join_code` (view/join), `admin_code` (end), or `heartbeat_token` (per-horse heartbeat).
- **Crash = absence of heartbeat.** No explicit "crash" endpoint; closing the terminal just stops heartbeats. Server computes `crashed = (now - last_heartbeat > 120s) && status !== 'finished'` on read.
- **Site is dumb.** Every 3s poll of `GET /races/<code>` returns the full state; JS renders it.
- **Local stable.** Horses don't leave the participant's machine except at join-time, when the chosen horse's config is copied into the race.

## Data model (DynamoDB single table)

### Race item

| Field | Value |
|---|---|
| `pk` | `RACE#<race_id>` |
| `sk` | `META` |
| `name` | string |
| `start_time` | ISO 8601 datetime with offset |
| `end_time` | ISO 8601 datetime with offset |
| `tz` | IANA tz name (for display) |
| `max_participants` | number (default 30) |
| `ended_at` | ISO 8601, **or absent**. Present ⇒ race is finished (set by `endRace` or lazily on first read after `end_time`). |
| `join_code` | 6-char `[A-Z0-9]` (collision-check before write) |
| `admin_code` | UUID v4 |
| `created_at` | ISO 8601 |

**Derived `status` (computed on read, never stored):**

```
if ended_at exists:              status = 'finished'
elif now >= end_time:             status = 'finished'   (and ended_at lazily persisted)
elif now < start_time:            status = 'pending'
else:                             status = 'live'
```

### Horse item

| Field | Value |
|---|---|
| `pk` | `RACE#<race_id>` |
| `sk` | `HORSE#<horse_id>` |
| `horse_id` | UUID v4 |
| `name` | string |
| `colors` | `{ body: hex, mane: hex, tail: hex, saddle: hex }` |
| `current_tokens` | number (updated on every heartbeat) |
| `last_heartbeat` | ISO 8601 |
| `heartbeat_token` | UUID v4 (per-horse shared secret) |
| `joined_at` | ISO 8601 |
| `final_tokens` | number (written when race ends) |

### GSIs

- `JoinCodeIndex`: pk = `join_code` → race_id
- `AdminCodeIndex`: pk = `admin_code` → race_id

### Query patterns

- **Create race:** `PutItem` (META row). Ensure join_code unique (conditional write).
- **View race:** GSI lookup `join_code → race_id`, then `Query(pk=RACE#<race_id>)` returns META + all horses.
- **Join:** GSI lookup, then conditional `PutItem` on horse; reject if horse count ≥ `max_participants`.
- **Heartbeat:** `UpdateItem` on horse row. Validates `heartbeat_token` match before write.
- **End race:** GSI lookup on admin_code, `UpdateItem` META (set `ended_at`) + batch update all horses' `final_tokens` = `current_tokens`.

## API contracts

Base URL: `https://token-derby.mauricode.co.uk/api`. Same origin as the site, so no CORS from the browser.

| Method & Path | Auth | Purpose |
|---|---|---|
| `POST /races` | — | Create race. Body: `{name, start_time, end_time, tz, max_participants}`. Returns `{race_id, join_code, admin_code}`. Rate-limited 10/hr per source IP. |
| `GET /races/:join_code` | — | Returns race meta + all horses with `computed_position`, `rank`, `crashed`. Poll target for site (3s) and CLI status screen. |
| `POST /races/:join_code/join` | — | Body: `{horse: {name, colors}}`. Returns `{horse_id, heartbeat_token}`. Rejects `RACE_FULL` (409), `RACE_FINISHED` (410). Rate-limited 20/hr per IP. |
| `POST /races/:join_code/horses/:horse_id/heartbeat` | `Bearer <heartbeat_token>` | Body: `{current_tokens}` — CLI-computed delta from baseline. Returns `{race_status, server_time, time_left_seconds}`. Rate-limited 2/min per horse. |
| `DELETE /races/admin/:admin_code` | — (code is the auth) | Ends race early. Freezes `final_tokens`. Returns `{ok: true}`. |

### Error envelope

```json
{ "code": "RACE_FULL", "message": "This race is full (30/30 horses)." }
```

Codes: `RACE_NOT_FOUND`, `RACE_FULL`, `RACE_FINISHED`, `INVALID_TOKEN`, `RATE_LIMITED`.

## CLI contracts

Installed via `npm i -g token-derby`. Node 20+.

### Commands

| Command | Behavior |
|---|---|
| `token-derby stable create` | Interactive pixel-preview wizard. Arrow keys navigate slots; ←/→ cycle colors. Name prompt at the end. Appends to `~/.token-derby/stable.json`. |
| `token-derby stable list` | Prints each horse with a tiny inline pixel-art preview using ANSI 24-bit color + Unicode half-blocks (`▀`/`▄`). |
| `token-derby stable delete <name>` | Confirms `y/N` and removes. Blocked if horse is currently racing. |
| `token-derby create` | Wizard: race name, start datetime, end datetime, tz (auto-detect default), max participants. Prints `join_code` large and `admin_code` with a "save this" warning. |
| `token-derby join <join-code>` | If stable empty → instruct to create. Otherwise picker over stable. Calls `POST /join`, writes active-race file, enters status-screen + heartbeat loop. |
| `token-derby rejoin <join-code>` | Reads `~/.token-derby/active-races/<join_code>.json` and resumes heartbeating. No picker. If no local file → friendly error. |
| `token-derby end <admin-code>` | Confirms `y/N`, calls `DELETE /races/admin/:code`. |

### Horse creator UX (`stable create`)

The horse creator renders a live pixel-art preview of the horse in the terminal.

- Sprite: same 32×24 pixel-art horse used on the site (see Site section)
- Rendered via Unicode half-blocks (`▀`/`▄`) with ANSI 24-bit color — each half-block shows two sprite pixels (top/bottom)
- Four color slots: body, mane, tail, saddle
- `↑`/`↓` — switch selected slot (highlighted in UI)
- `←`/`→` — cycle the palette for the selected slot (fixed palette of ~16 curated hex colors per slot)
- `Enter` — accept all colors, prompt for a name
- `Esc` — cancel without saving

Library: `ink` (React-for-CLI) is the preferred implementation; `blessed` or `terminal-kit` are acceptable alternatives if `ink`'s bundle size becomes a concern for the global install.

### Live status screen (during `join` / `rejoin`)

Rendered via the same TUI library used for the creator. Polls `GET /races/:code` every 3s and sends a heartbeat every 60s.

```
┌─ TOKEN DERBY ─────────────────── Q2 TEAM DERBY ──┐
│   🐎  Gallopin' Gary                              │
│   ▀▄▀▄▀▄   (live preview of your horse)          │
│                                                   │
│   Tokens (race):    8,240                         │
│   Position:         2 of 6                        │
│   Leader:           Prompt Pony (12,400)          │
│   Race elapsed:     67%  ──────────────▓░░░       │
│   Time left:        00:14:32                      │
│   Last heartbeat:   12s ago ✓                     │
│                                                   │
│   Press Ctrl+C to crash out of the race.          │
└───────────────────────────────────────────────────┘
```

`Ctrl+C` or terminal close: exit immediately, no goodbye call — server's heartbeat timeout detects it.

### Token reading

- Source: all `*.jsonl` files under `~/.claude/projects/*/`
- Per assistant message: sum `message.usage.output_tokens`
- CLI maintains a running total of "output tokens observed"
- Each heartbeat sends `current_tokens = max(0, running_total - baseline)`

### Baseline handling by race status at join

| Race status when CLI joins | CLI behavior |
|---|---|
| `live` | Set `baseline = running_total` immediately. Heartbeats send real deltas from this moment. |
| `pending` | Set `baseline = running_total` at join, but send `current_tokens: 0` in every heartbeat until `now ≥ race.start_time`. At that moment, re-snapshot `baseline = running_total` and begin sending real deltas. (CLI knows `start_time` from the `GET /races/:code` poll response.) Horse appears at the gate during pending. |
| `finished` | API rejects the join with `410 RACE_FINISHED`. |

### Rejoin re-baselining (so crashed-window tokens do not count)

On every successful heartbeat, the CLI persists the sent `current_tokens` as `last_race_tokens` in `~/.token-derby/active-races/<join_code>.json`.

On `rejoin`:

```
running_total  = read from transcripts (now)
last_race_tokens = read from active-races file (last successful heartbeat value)
baseline        = running_total - last_race_tokens
```

Then the first heartbeat sends `current_tokens = last_race_tokens` (same as before the crash), and future heartbeats accrue from there. Tokens the user generated while disconnected are effectively skipped — matching the "crashed = out of race for that window" rule.

## Site

### Pages

- **`/` (home):** pixel-art Token Derby logo + single input *"Enter race code"*. Submit → `/race/<code>`.
- **`/race/<join_code>`:** the race view. Three render states:
  - **Pending** (`now < start_time`): stadium drawn, all joined horses lined up at start. Countdown banner *"Race starts in 00:04:12"*.
  - **Live:** stadium animates. Horses glide between poll positions (`transition: left 3s linear`).
  - **Finished** (`status = finished` or `now ≥ end_time`): positions freeze. Pixel-art 🏆 podium overlay fades in with top 3. Full standings scroll below. CSS-only confetti.

### Position math

```
elapsed_pct   = clamp((now - start_time) / (end_time - start_time), 0, 1)
leader_tokens = max(horse.current_tokens for horse in horses) or 1
for each horse:
  horse_x_pct = (horse.current_tokens / leader_tokens) * elapsed_pct * 100
```

- Leader sits at exactly `elapsed_pct` of the track — crosses finish line precisely at `end_time`
- Everyone else scales proportional to the leader
- Crashed horses: tip 75°, fade to 40% opacity, anchored at their last `horse_x_pct`
- Lanes assigned by join order (stable across polls; horses never jump lanes)

### Animation

- Horse leg-swing: 2-frame CSS `@keyframes`, 200ms cycle
- Position movement: `transition: left 3s linear` (matches poll interval → continuous motion)
- Crash fall: 1s one-shot transition triggered when `crashed` flag flips
- Confetti (finished): ~40 CSS `<div>`s with randomized `animation-delay`, pure CSS

### Rendering tech

- Plain HTML + one JS file. No framework.
- Horse sprite: SVG `<symbol>` + `<use>`, colors via CSS custom properties per horse row
- State reconciled diff-style against poll responses (never re-create DOM every 3s)

## Edge cases

| Scenario | Behavior |
|---|---|
| CLI loses network briefly | Heartbeat retries 1s → 2s → 4s (cap 15s). Status line warns *"Last heartbeat 45s ago ⚠️"*. If >120s, server marks crashed. Reconnect auto-uncrashes. |
| Clock skew between CLI and server | Server is the authority. CLI displays `race_elapsed` / `time_left_seconds` from server fields on every response. |
| Duplicate horse name within one stable | Prompt *"Name 'Gary' already exists. Overwrite? y/N"* |
| Duplicate horse names across a race | Allowed — identity is the `horse_id`, not name. |
| Race full on join | API 409 `RACE_FULL`. CLI prints *"This race is full (30/30 horses)."* |
| Race ends while heartbeating | Heartbeat response has `race_status=finished`. CLI prints final standings and exits 0. |
| Corrupted / unreadable transcript | CLI logs the error, keeps last-known total, keeps heartbeating. Does not crash the horse. |
| Horse with 0 tokens all race | Stays at start line, last place, `0 tok`. Not filtered. |
| CLI run on a second machine mid-race | `rejoin` fails (no local state). `join` with a new horse succeeds. No cross-machine horse handoff. |
| Delete a horse that's currently racing | Blocked: *"Gary is currently running in K3QP7M. Close that terminal first."* |
| Leader has 0 tokens | `leader_tokens` clamped to 1; everyone stays visually at 0. |
| End time passes without `endRace` call | `GET /races` computes `status=finished` on read. No scheduled job needed. |

### Heartbeat idempotency

If the same `current_tokens` is posted twice (retry), the second call is a no-op on value but still refreshes `last_heartbeat`. No duplicate-token risk.

## Testing strategy

- **Unit:** position math, transcript parser, crash-detection formula, baseline calculator, join-code generator. All pure functions.
- **Integration (API):** DynamoDB Local + Lambda handlers. Cover full join → heartbeat → end-race flow, plus edge cases from the table above.
- **CLI smoke tests:** spawn the CLI pointed at a temp directory with fake `~/.claude/projects` transcripts; assert it hits a mock server with the right numbers at the right cadence.
- **Manual E2E for the site:** pending → live → finished transitions across a short (e.g., 2-minute) test race. No automated browser tests for MVP.

## Deployment

### Hosting

- Single CDK stack: `TokenDerbyStack`, region `eu-west-2`
- Domain: `token-derby.mauricode.co.uk` (hosted zone `mauricode.co.uk` already exists in Route 53)
- ACM certificate via `DnsValidatedCertificate`, `region: 'us-east-1'` (CloudFront requirement)
- S3 private bucket, OAC to CloudFront
- CloudFront distribution — default behavior → S3; `/api/*` behavior → API Gateway (no CORS from browser)
- API Gateway HTTP API + Lambda (`createRace`, `getRace`, `joinRace`, `heartbeat`, `endRace`)
- DynamoDB single table, on-demand billing
- Route 53 A-record alias → CloudFront distribution

### Project structure (to be created)

```
token_derby/
├── cli/                      # Node package: published as `token-derby`
│   ├── src/
│   └── package.json
├── site/                     # Static HTML/JS
│   ├── index.html
│   ├── race.html
│   ├── horse-sprite.svg
│   └── main.js
├── api/                      # Lambda handlers
│   ├── create-race.ts
│   ├── get-race.ts
│   ├── join-race.ts
│   ├── heartbeat.ts
│   └── end-race.ts
├── infra/                    # CDK (TypeScript)
│   ├── bin/
│   └── lib/token-derby-stack.ts
├── shared/                   # Types + constants shared between CLI/API/site
└── Makefile
```

Pattern mirrors `easter-eggscape-room` where possible.

### CDK dependencies

`aws-cdk-lib` (route53, route53-targets, s3, s3-deployment, cloudfront, cloudfront-origins, acm, certificatemanager, apigatewayv2, apigatewayv2-integrations, lambda, dynamodb, iam)

## Out of scope (MVP)

- User accounts / login
- Horse accessories beyond the 4 color slots
- Betting / spectator interactions
- Cross-race leaderboards
- Slack / Discord bot integrations
- Exporting results as PNG cards
- Historical analytics
- Multi-region / HA
- WebSocket live updates
- Custom race themes / skins
- Server-side stable storage
- Cross-machine rejoin
- Automatic race cleanup / TTL (creator runs `token-derby end` manually to delete)
