// Ported unchanged from site/src/hat-svg.ts.
import type { Hat } from '@token-derby/shared';
import { HATS } from '@token-derby/shared';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Build a <g class="horse-hat"> for a hat + variant index.
 * The hat is positioned so its bottom 4 rows overlap horse y=0..3 — the hat
 * sits flush on the flat head (overlap rule). For non-legendary hats `variantIdx`
 * picks from `hat.variants[]`; legendaries use `hat.colors` directly.
 *
 * Pixels at x >= 32 represent hat overhang past the 32-wide horse sprite.
 * The horse SVG viewBox must be wide enough to show these (see sprite-svg.ts).
 *
 * On first call against a Document, installs the legendary animation
 * keyframes into <head> automatically, so every entry point gets animated
 * legendaries for free.
 */
export function buildHatGroup(doc: Document, hat: Hat, variantIdx: number): SVGGElement {
  ensureLegendaryStylesInstalled(doc);
  const g = doc.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('class', `horse-hat horse-hat-${hat.id}`);

  const ext = Math.max(0, hat.rows.length - 4);
  const colors = hatColorsFor(hat, variantIdx);

  for (let i = 0; i < hat.rows.length; i++) {
    const row = hat.rows[i]!;
    for (let j = 0; j < row.length; j++) {
      const ch = row[j];
      if (ch === '.') continue;
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(hat.anchor_x + j));
      rect.setAttribute('y', String(i - ext));
      rect.setAttribute('width', '1');
      rect.setAttribute('height', '1');
      rect.setAttribute('class', ch === 'A' ? 'hat-a' : 'hat-q');
      rect.setAttribute('fill', ch === 'A' ? colors.A : (colors.Q ?? colors.A));
      g.appendChild(rect);
    }
  }
  return g;
}

function hatColorsFor(hat: Hat, variantIdx: number): { A: string; Q?: string } {
  if (hat.rarity === 'legendary') return hat.colors;
  return hat.variants[variantIdx] ?? hat.variants[0]!;
}

/**
 * Build a <style> block with @keyframes for every legendary hat's animation.
 * Each animation frame is held for its full slice of duration (discrete frame
 * replacement, no interpolation) via dual stops.
 */
export function buildLegendaryKeyframes(): string {
  const blocks: string[] = [];
  for (const hat of HATS) {
    if (hat.rarity !== 'legendary') continue;
    const { frames, fps } = hat.animation;
    const N = frames.length;
    const dur = N / fps;
    const epsilon = 0.001;
    let stops = '';
    for (let i = 0; i < N; i++) {
      const startPct = (i / N) * 100;
      const endPct = ((i + 1) / N) * 100 - epsilon;
      stops += `${startPct.toFixed(4)}% { fill: ${frames[i]}; } ${endPct.toFixed(4)}% { fill: ${frames[i]}; } `;
    }
    blocks.push(`@keyframes anim-${hat.id} { ${stops} } .horse-hat-${hat.id} .hat-a { animation: anim-${hat.id} ${dur}s linear infinite; }`);
  }
  return blocks.join('\n');
}

const STYLE_MARKER_ID = 'td-hat-legendary-keyframes';

/**
 * Install the legendary keyframes into the document <head> if not already
 * present. Idempotent: safe to call from buildHatGroup on every invocation.
 */
export function ensureLegendaryStylesInstalled(doc: Document): void {
  if (doc.getElementById(STYLE_MARKER_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_MARKER_ID;
  style.textContent = buildLegendaryKeyframes();
  doc.head.appendChild(style);
}
