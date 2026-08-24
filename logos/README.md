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

The pixel art is not duplicated here. `gen-logo.mjs` reads the same rows and
colours as `site/src/horse-face.ts`, so the logo and the site header cannot
drift apart. If the horse changes there, re-run this rather than editing a PNG:

```
node logos/gen-logo.mjs
```
