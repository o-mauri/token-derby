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
