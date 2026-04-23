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
