# Logos

The horse head from the homepage, rendered as a square image for places that
need one — currently the Google OAuth consent screen, which requires a square
PNG/JPG/BMP no larger than 1MB and recommends 120x120.

| File | Use |
|---|---|
| `token-derby-logo-120.png` | Google OAuth consent screen |
| `token-derby-logo-240.png` | Same artwork at 2x, for anywhere needing more detail |
| `token-derby-logo.svg` | Vector source; scales to any size |
| `gen-logo.mjs` | Regenerates all three |

The pixel art is not duplicated here. `gen-logo.mjs` imports `FACE_ROWS` and
`COLOR` from `site/src/horse-face.ts` — the one place either is defined — so the
logo and the site header cannot drift apart. If the horse changes there, re-run
this rather than editing a PNG:

```
node logos/gen-logo.mjs
```

That rewrites the SVG in place and rasterises both PNGs from it. Two external
requirements, neither of them a package dependency:

- Node >= 22.18 (or >= 23.6), for the built-in type stripping that lets a plain
  `.mjs` import a `.ts` file.
- `rsvg-convert` on `PATH` (`brew install librsvg`) for the PNGs. Without it the
  SVG is still regenerated and the script says which PNGs it could not rewrite.

Passing an explicit output path (`node logos/gen-logo.mjs /tmp/out.svg`) writes
only that SVG and skips the PNGs.
