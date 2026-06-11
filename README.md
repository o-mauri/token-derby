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
npm i -g @mauricode/token-derby
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

## API (base: `https://token-derby.mauricode.co.uk/api`)

```
POST   /races                                              -> create a race
GET    /races/{join_code}                                  -> race view (polled by site / CLI)
POST   /races/{join_code}/join                             -> register a horse
POST   /races/{join_code}/horses/{horse_id}/heartbeat      -> update current_tokens
DELETE /races/admin/{admin_code}                           -> end the race
```

Request/response shapes and error envelopes are defined in `shared/src/api.ts` and `shared/src/errors.ts`.
