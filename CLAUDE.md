# Token Derby

## Versions and changelog belong to the release script — never edit them

`scripts/release.mjs` owns all three of these files. Never edit them as part of
feature work, for either component:

- `cli/package.json` — the `version` field
- `site/package.json` — the `version` field
- `site/src/changelog.json` — the entry list (holds both `cli` and `site` entries)

Releases run through it, not by hand:

- `make publish-cli` → `release.mjs cli` — bumps the CLI version, records the
  changelog entry, publishes to npm
- `make deploy` → `release.mjs site` — same for the site, then deploys

The script prompts for the bump level and the changelog lines at release time, and
reverts both the version and the entry if the release step fails. Editing either
file by hand puts a version in the changelog that was never published, and leaves
the script reverting to a state that was already wrong.

Build the feature, update the relevant README, and stop there. This applies even
when a change is plainly user-facing and an entry would look correct — do not add
one preemptively.

## Site loading states use `createLoader` — never plain "Loading…" text

Any new site page or view that waits on data before it can render must show
`createLoader(doc)` from `site/src/render/loader.ts` while it loads. Don't use a
`<p>Loading…</p>`, a spinner of your own, or a blank area.

- Put the loader in the page's main flex column. It centres itself with
  `margin: auto`, so it needs no positioning of its own.
- Swap it out when the data or an error message arrives. Removing it, or replacing
  the container's contents, is enough. It needs no cleanup.
- Leave any API-sourced title (an org or race name) blank until the response
  arrives. Showing the typed URL value first makes it jump when the real casing
  lands.
- Don't add your own delay or fade. The loader's CSS hides it for the first 250ms
  and respects `prefers-reduced-motion`.
- Add a test that the loader shows before the data resolves and is gone after,
  like `site/test/race-loader.test.ts`. Check the result at `/preview-loader`.
