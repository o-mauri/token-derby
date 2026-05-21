# Sprites

Source files for the pixel-art assets. `.ase` files are the editable sources
(LibreSprite / Aseprite format). The exported `.png` sprite sheets live in
`site/public/img/` — that's what the running app loads.

## Exporting a `.ase` to a PNG sprite sheet

Open the `.ase` in LibreSprite, then:

1. **File → Export Sprite Sheet…**
2. **Sheet Type:** Vertical (frames stack top-to-bottom).
3. **Layers:** Visible Layers.
4. **Frames:** All Frames.
5. Save as `<name>.png` into `site/public/img/`.

A 4-frame, 32×32-per-frame animation comes out as a 32×128 PNG.

## Why vertical?

The crowd body (e.g. `crowd-1.png`) is rendered as a CSS background with
`background-repeat: repeat-x` so it tiles across the band's width, while the
animation steps frames by shifting `background-position-y`. Stacking frames
vertically keeps the repeat axis (X) and the animation axis (Y) separate so
they don't fight.

## CLI (optional)

LibreSprite ships a batch CLI compatible with the pre-fork Aseprite flags. On
macOS, from the repo root:

```sh
/Applications/LibreSprite.app/Contents/MacOS/libresprite \
  -b sprites/crowd-1.ase \
  --sheet site/public/img/crowd-1.png \
  --sheet-type vertical
```

Same flags work for any other `.ase` — swap the input and output paths.
