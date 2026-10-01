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

## Themes

The picker in the page header writes `td_theme` to localStorage; `src/theme.ts`
holds the registry, and `public/styles.css` a `:root[data-theme="…"]` block per id.

To put everyone on one theme for an event, set `EVENT_THEME` in `src/theme.ts` and
mirror the two literals in the pre-paint script in `public/index.html` (a test
fails if they drift). The next load flips every browser to it once, whatever they
had saved; the picker works normally afterwards, so people can still switch away.
Set both to `null` to end the event — everyone keeps whatever they last had, which
for most will be the event theme. Bump the tag to run the same theme again later.

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
