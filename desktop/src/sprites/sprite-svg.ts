// Ported from site/src/sprite-svg.ts — same DOM-based pixel-rect renderer,
// unchanged, so the desktop sprite matches the site/CLI sprite exactly.
import { GRID, SPRITE_WIDTH, SPRITE_HEIGHT, type SlotTag } from './sprite-grid.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const SLOT_COLOR: Record<Exclude<SlotTag, null>, string> = {
  B: 'var(--body)',
  M: 'var(--mane)',
  T: 'var(--tail)',
  S: 'var(--saddle)',
  H: '#1F1108',
};

// Leg segments:  rows 16-17 = upper (thigh),  rows 18-23 = lower (shin+hoof).
// Back legs x < 14,  Front legs x >= 14.
const UPPER_LEG_START = 16;
const LOWER_LEG_START = 18;
const LEG_SPLIT_X = 14;

function g(doc: Document, cls: string): SVGGElement {
  const el = doc.createElementNS(SVG_NS, 'g');
  el.setAttribute('class', cls);
  return el;
}

export function buildHorseSvg(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  // viewBox extended to fit hat overhang: 6 rows above the horse origin
  // for tall hats, and 3 cols past the right edge — covers the widest current
  // hat (plague_doctor anchored at x=24 with width 11 → rightmost x=34).
  svg.setAttribute('viewBox', `0 -6 ${SPRITE_WIDTH + 3} ${SPRITE_HEIGHT + 6}`);
  svg.setAttribute('class', 'horse-sprite');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');

  const bodyGroup = g(doc, 'horse-body');

  // Skeletal leg hierarchy:  hip group > upper rects + knee group > lower rects
  const backHip   = g(doc, 'leg-back');
  const backUpper = g(doc, 'leg-back-upper');
  const backKnee  = g(doc, 'leg-back-lower');
  backHip.appendChild(backUpper);
  backHip.appendChild(backKnee);

  const frontHip   = g(doc, 'leg-front');
  const frontUpper = g(doc, 'leg-front-upper');
  const frontKnee  = g(doc, 'leg-front-lower');
  frontHip.appendChild(frontUpper);
  frontHip.appendChild(frontKnee);

  for (let y = 0; y < GRID.length; y++) {
    for (let x = 0; x < SPRITE_WIDTH; x++) {
      const tag = GRID[y]![x]!;
      if (tag === null) continue;
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '1');
      rect.setAttribute('height', '1');
      rect.setAttribute('fill', SLOT_COLOR[tag]);

      if (y >= LOWER_LEG_START) {
        (x < LEG_SPLIT_X ? backKnee : frontKnee).appendChild(rect);
      } else if (y >= UPPER_LEG_START) {
        (x < LEG_SPLIT_X ? backUpper : frontUpper).appendChild(rect);
      } else {
        bodyGroup.appendChild(rect);
      }
    }
  }

  svg.appendChild(backHip);
  svg.appendChild(frontHip);
  svg.appendChild(bodyGroup);
  return svg;
}
