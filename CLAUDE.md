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
