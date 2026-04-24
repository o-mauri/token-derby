import { GRID, SPRITE_WIDTH, SPRITE_HEIGHT, type SlotTag } from './sprite-grid.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const SLOT_COLOR: Record<Exclude<SlotTag, null>, string> = {
  B: 'var(--body)',
  M: 'var(--mane)',
  T: 'var(--tail)',
  S: 'var(--saddle)',
  H: '#1F1108',
};

export function buildHorseSvg(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${SPRITE_WIDTH} ${SPRITE_HEIGHT}`);
  svg.setAttribute('class', 'horse-sprite');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');

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
      svg.appendChild(rect);
    }
  }
  return svg;
}
