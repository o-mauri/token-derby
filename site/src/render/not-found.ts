import { buildHorseSvg } from '../sprite-svg.js';

// Reusable "nothing here" block: the loader's porthole, frozen, with a lost horse
// thinking "?" over its head. Styles live in styles.css; it centres itself.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Same brown as the loader's near horse.
const HORSE_COLORS = { body: '#8B4513', mane: '#2b1a0e', tail: '#2b1a0e', saddle: '#d94848' };

// Thought bubble pixel art, drawn at BUBBLE_UNIT px per cell over the horse's head.
const BUBBLE_ROWS: readonly string[] = [
  '..oooooooooo..',
  '.owwwwwwwwwwo.',
  'owwwwwwwwwwwwo',
  'owwwwqqqqwwwwo',
  'owwwqqwwqqwwwo',
  'owwwwwwwqqwwwo',
  'owwwwwwqqwwwwo',
  'owwwwwqqwwwwwo',
  'owwwwwwwwwwwwo',
  'owwwwwqqwwwwwo',
  'owwwwwqqwwwwwo',
  '.owwwwwwwwwwo.',
  '..oooooooooo..',
  '..............',
  '....ooo.......',
  '....owo.......',
  '....ooo.......',
  '..............',
  '...oo.........',
  '...oo.........',
];
const BUBBLE_COLOR: Record<string, string> = { o: '#2b1a0e', w: '#f5e9d3', q: '#d94848' };
const BUBBLE_UNIT = 3;
const BUBBLE_ORIGIN = { x: 110, y: 4 }; // in the porthole's 214×214 viewBox

export type NotFoundMessagePart = string | { strong: string };

export interface NotFoundOptions {
  title: string;
  // Text parts; { strong } marks the value the visitor typed. Always rendered as text.
  message: NotFoundMessagePart[];
  back: { label: string; href: string };
}

export function createNotFound(doc: Document, opts: NotFoundOptions): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'not-found';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="not-found-ring"><div class="not-found-porthole"><div class="not-found-track"></div></div></div>
    <h2></h2>
    <p></p>
    <a class="btn"></a>
  `;

  const track = el.querySelector<HTMLElement>('.not-found-track')!;
  const horse = doc.createElement('div');
  horse.className = 'not-found-horse';
  for (const [slot, color] of Object.entries(HORSE_COLORS)) horse.style.setProperty(`--${slot}`, color);
  horse.appendChild(buildHorseSvg(doc));
  track.append(horse, buildBubble(doc));

  el.querySelector('h2')!.textContent = opts.title;
  const p = el.querySelector('p')!;
  for (const part of opts.message) {
    if (typeof part === 'string') { p.append(part); continue; }
    const strong = doc.createElement('strong');
    strong.textContent = part.strong;
    p.append(strong);
  }

  const link = el.querySelector<HTMLAnchorElement>('a.btn')!;
  link.textContent = opts.back.label;
  link.href = opts.back.href;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    window.history.pushState({}, '', opts.back.href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  return el;
}

function buildBubble(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'not-found-bubble');
  svg.setAttribute('viewBox', '0 0 214 214');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  BUBBLE_ROWS.forEach((row, y) => {
    [...row].forEach((c, x) => {
      const fill = BUBBLE_COLOR[c];
      if (!fill) return;
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(BUBBLE_ORIGIN.x + x * BUBBLE_UNIT));
      rect.setAttribute('y', String(BUBBLE_ORIGIN.y + y * BUBBLE_UNIT));
      rect.setAttribute('width', String(BUBBLE_UNIT));
      rect.setAttribute('height', String(BUBBLE_UNIT));
      rect.setAttribute('fill', fill);
      svg.appendChild(rect);
    });
  });
  return svg;
}
