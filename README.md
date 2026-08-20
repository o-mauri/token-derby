# Token Derby

A pixel-art daily horse race where each horse is a participant and every length gained is an output token their Claude Code produced. One-shot races, scheduled start/end times, customizable horses, terminal-as-life-support (close the terminal → your horse crashes).

- **Site:** https://token-derby.mauricode.co.uk

## Project layout

- `shared/` — domain types, API contracts, error codes, constants
- `api/` — Lambda handlers (`createRace`, `getRace`, `joinRace`, `heartbeat`, `endRace`)
- `infra/` — AWS CDK stack (eu-west-2, with cross-region ACM in us-east-1)
- `cli/` — [`@mauricode/token-derby`](https://www.npmjs.com/package/@mauricode/token-derby) npm package — see `cli/README.md`
- `site/` — static race viewer — see `site/README.md`. Live at [token-derby.mauricode.co.uk](https://token-derby.mauricode.co.uk).

## Install the CLI

```bash
npm i -g @mauricode/token-derby@latest
token-derby --help
```

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

## Releases

`make deploy` releases the site, `make publish-cli` releases the CLI. Both bump
the version, prepend a `site/src/changelog.json` entry, publish, then announce
the release to every org that has "Release published" enabled in its Slackbot
settings. `make deploy` also accepts a `none` bump, which deploys the site as-is
with no version change, no changelog entry, and no announcement. `make
publish-cli` rejects `none` — npm won't accept a duplicate version.

The announcement needs these in the root `.env` (gitignored):

```
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
TOKEN_DERBY_API_BASE=https://token-derby.mauricode.co.uk/api   # optional, this is the default
```

If the announcement fails after a successful publish, the release still
succeeds — retry with `make announce-release COMPONENT=cli VERSION=2.13.0`.

## Admin dashboard

The admin dashboard at `admin.token-derby.mauricode.co.uk` reads its single
owner credential from SSM SecureString parameters (never committed). Provision
them once per AWS account:

```bash
# 1. Hash your chosen password locally (prints "saltHex:hashHex"):
npx tsx -e "import('./api/src/lib/admin-auth.js').then(m => console.log(m.hashPassword(process.argv[1])))" 'YOUR_PASSWORD'

# 2. Store the three parameters as SecureStrings.
#    IMPORTANT: use the same account/region the stack deploys into — region
#    eu-west-2 (hardcoded in infra/bin/token-derby.ts), and the same profile you
#    deploy with (the Makefile uses --profile personal). The Lambdas read SSM in
#    their own region (eu-west-2); params written elsewhere → login 500s.
aws ssm put-parameter --profile personal --region eu-west-2 --type SecureString --name /token-derby/admin/username       --value 'omar'
aws ssm put-parameter --profile personal --region eu-west-2 --type SecureString --name /token-derby/admin/password-hash  --value 'SALT:HASH_FROM_STEP_1'
aws ssm put-parameter --profile personal --region eu-west-2 --type SecureString --name /token-derby/admin/session-secret --value "$(openssl rand -hex 32)"
```

The three admin Lambdas read these at cold start (cached). To rotate a value,
overwrite the parameter; the change takes effect on the next Lambda cold start.

The Lambdas are granted `ssm:GetParameter`, which is sufficient for `SecureString`
parameters encrypted with the default `aws/ssm` managed key (as created above). If
you instead encrypt them with a customer-managed KMS key, also grant the Lambdas
`kms:Decrypt` on that key.

## Google SSO

Web sign-in uses a Google OAuth client. Three SSM SecureStrings hold its
config, read at Lambda cold start and cached:

    /token-derby/auth/google-client-id
    /token-derby/auth/google-client-secret
    /token-derby/auth/state-secret          # openssl rand -hex 32

Provision them in the same account and region the stack deploys into
(`eu-west-2` — the CLI default is `eu-west-1`, and params in the wrong region
make sign-in 500 with no obvious cause):

```bash
aws ssm put-parameter --profile personal --region eu-west-2 --type SecureString \
  --name /token-derby/auth/google-client-id     --value 'YOUR_CLIENT_ID'
aws ssm put-parameter --profile personal --region eu-west-2 --type SecureString \
  --name /token-derby/auth/google-client-secret --value 'YOUR_CLIENT_SECRET'
aws ssm put-parameter --profile personal --region eu-west-2 --type SecureString \
  --name /token-derby/auth/state-secret         --value "$(openssl rand -hex 32)"
```

The Google client is a **Web application** client with two authorised redirect
URIs — the production callback and `http://localhost:3000/api/auth/google/callback`
for the local harness. Authorised JavaScript origins stay empty: this is the
server-side code flow, not the browser SDK.

`mauricode.co.uk` must be a verified domain in Google Search Console (DNS TXT at
the apex) before the consent screen will accept it. That record is **deliberately
not managed by CDK** — it covers the whole domain, and a `cdk destroy` would take
it with it, un-verifying the OAuth app.

To rotate the client secret: reset it in the Google console, then re-run the
`google-client-secret` command above. It takes effect on the next Lambda cold
start; no redeploy is needed.

## Staging environment

A full staging stack runs alongside production in the same AWS account at
`https://token-derby-staging.mauricode.co.uk`.

Deploy / tear down:

    make deploy-staging      # deploy staging (cdk deploy -c env=staging)
    make destroy-staging     # tear down staging (table is disposable)

`make deploy` / `make destroy` continue to target production unchanged.

### One-time: seed staging admin secrets

Staging admin login reads `/token-derby-staging/admin/*` in SSM. Seed the three
parameters once (see `docs/superpowers/specs/2026-07-03-staging-environment-design.md`
for the exact commands):

- `/token-derby-staging/admin/username`
- `/token-derby-staging/admin/password-hash` (scrypt `saltHex:hashHex`)
- `/token-derby-staging/admin/session-secret`

### CLI against staging

    token-derby env staging   # switch the CLI to staging (own identity dir)
    token-derby env           # show the active environment
    token-derby env prod      # switch back

Each environment keeps its own identity under `~/.token-derby` (prod) and
`~/.token-derby-staging` (staging), so switching never touches the other
account's credentials.

## API (base: `https://token-derby.mauricode.co.uk/api`)

```
POST   /races                                              -> create a race
GET    /races/{join_code}                                  -> race view (polled by site / CLI)
POST   /races/{join_code}/join                             -> register a horse
POST   /races/{join_code}/horses/{horse_id}/heartbeat      -> update current_tokens
DELETE /races/admin/{admin_code}                           -> end the race
```

Request/response shapes and error envelopes are defined in `shared/src/api.ts` and `shared/src/errors.ts`.
