import { HATS } from '@token-derby/shared';
import type { Hat, HatRarity, HorseColors } from '@token-derby/shared';
import { horseFaceSvg } from '../horse-face.js';
import { buildHorseSvg } from '../sprite-svg.js';
import { buildHatGroup } from '../hat-svg.js';

type Palette = HorseColors & { name: string };

const PALETTES: Record<string, Palette> = {
  chestnut:  { name: 'Chestnut', body: '#A0522D', mane: '#2F1B0C', tail: '#2F1B0C', saddle: '#8B4513' },
  black:     { name: 'Black',    body: '#2C2C2C', mane: '#0A0A0A', tail: '#0A0A0A', saddle: '#5A3A1E' },
  palomino:  { name: 'Palomino', body: '#D4A14A', mane: '#F4E5C2', tail: '#F4E5C2', saddle: '#7A4F1E' },
  grey:      { name: 'Grey',     body: '#B0B0B5', mane: '#E8E8EC', tail: '#E8E8EC', saddle: '#3F2A18' },
  appaloosa: { name: 'Roan',     body: '#7A5C4A', mane: '#3A2620', tail: '#3A2620', saddle: '#2D1810' },
};

const RARITY_ORDER: HatRarity[] = ['common', 'rare', 'epic', 'legendary'];

function variantCount(hat: Hat): number {
  return hat.rarity === 'legendary' ? 1 : hat.variants.length;
}

export function renderCatalog(root: HTMLElement): () => void {
  const doc = root.ownerDocument;
  root.innerHTML = '';

  let activePalette: keyof typeof PALETTES = 'chestnut';

  const section = doc.createElement('section');
  section.className = 'catalog';
  section.innerHTML = `
    <header class="catalog-header">
      <h1>${horseFaceSvg()} HAT CATALOG <span class="horse-face-flip">${horseFaceSvg()}</span></h1>
      <button type="button" class="btn home-btn">← Home</button>
    </header>
    <p class="catalog-intro">
      Every hat in the catalog, one row per hat with all variants laid out side-by-side.
      Non-legendary variants are named “Hat Name #N” — each is a distinct collectible.
      Legendary hats are one-of-a-kind designs that animate in real time.
    </p>
    <div class="catalog-controls">
      <span class="catalog-control-label">Horse</span>
      <div class="palette-controls"></div>
    </div>
    <main class="catalog-sections"></main>
    <p class="catalog-footer">
      Roll model: pick rarity tier (37/15/7/1) → pick hat uniformly within tier → pick variant uniformly within hat.
      Hats with more variants are no more common overall, but each individual variant is rarer.
    </p>
  `;
  root.appendChild(section);

  const homeBtn = section.querySelector<HTMLButtonElement>('.home-btn')!;
  homeBtn.addEventListener('click', () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  const paletteEl = section.querySelector<HTMLElement>('.palette-controls')!;
  const sectionsEl = section.querySelector<HTMLElement>('.catalog-sections')!;

  const renderPaletteControls = () => {
    paletteEl.innerHTML = '';
    for (const [key, palette] of Object.entries(PALETTES)) {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = `palette-btn${key === activePalette ? ' active' : ''}`;
      btn.textContent = palette.name;
      btn.addEventListener('click', () => {
        activePalette = key as keyof typeof PALETTES;
        renderPaletteControls();
        renderSections();
      });
      paletteEl.appendChild(btn);
    }
  };

  const renderSections = () => {
    sectionsEl.innerHTML = '';
    const palette = PALETTES[activePalette]!;
    for (const rarity of RARITY_ORDER) {
      const hats = HATS.filter(h => h.rarity === rarity);
      if (hats.length === 0) continue;

      const totalVariants = hats.reduce((s, h) => s + variantCount(h), 0);

      const heading = doc.createElement('h2');
      heading.className = `rarity-heading rarity-${rarity}`;
      heading.innerHTML = `
        <span class="rarity-name">${rarity}</span>
        <span class="rarity-meta">${hats.length} ${hats.length === 1 ? 'hat' : 'hats'} · ${totalVariants} ${totalVariants === 1 ? 'collectible' : 'collectibles'}</span>
      `;
      sectionsEl.appendChild(heading);

      for (const hat of hats) {
        sectionsEl.appendChild(renderHatRow(doc, hat, palette));
      }
    }
  };

  renderPaletteControls();
  renderSections();

  return () => { /* nothing to tear down */ };
}

function renderHatRow(doc: Document, hat: Hat, palette: Palette): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'hat-row';

  const meta = doc.createElement('div');
  meta.className = 'hat-meta';
  meta.innerHTML = `
    <div class="hat-name-row">
      <span class="hat-name">${escapeHtml(hat.name)}</span>
      <span class="rarity-badge rarity-${hat.rarity}">${hat.rarity}</span>
    </div>
    <div class="hat-id">${escapeHtml(hat.id)}</div>
    ${hat.rarity === 'legendary'
      ? '<div class="hat-count">one-of-one · animated</div>'
      : `<div class="hat-count">${hat.variants.length} ${hat.variants.length === 1 ? 'variant' : 'variants'}</div>`}
  `;
  row.appendChild(meta);

  const strip = doc.createElement('div');
  strip.className = 'variants-strip';
  const n = variantCount(hat);
  for (let i = 0; i < n; i++) {
    strip.appendChild(renderVariantCard(doc, hat, i, palette));
  }
  row.appendChild(strip);

  return row;
}

function renderVariantCard(doc: Document, hat: Hat, variantIdx: number, palette: Palette): HTMLElement {
  const card = doc.createElement('div');
  card.className = `variant-card ${hatNeedsLightBg(hat, variantIdx) ? 'variant-card-light' : 'variant-card-dark'}`;
  card.style.setProperty('--body', palette.body);
  card.style.setProperty('--mane', palette.mane);
  card.style.setProperty('--tail', palette.tail);
  card.style.setProperty('--saddle', palette.saddle);

  const horseSvg = buildHorseSvg(doc);
  horseSvg.appendChild(buildHatGroup(doc, hat, variantIdx));
  card.appendChild(horseSvg);

  const label = doc.createElement('div');
  label.className = 'variant-name';
  label.textContent = hat.rarity === 'legendary' ? hat.name : `${hat.name} #${variantIdx + 1}`;
  card.appendChild(label);

  return card;
}

// Use a lighter card background when the hat's primary colour would
// disappear against pure black. Threshold ~0.18 puts very-dark greys
// (#2C2C2C ≈ 0.027, #1A0033 ≈ 0.005) into the "light bg" bucket while
// keeping mid-tones like the chestnut palette saddle on dark.
function hatNeedsLightBg(hat: Hat, variantIdx: number): boolean {
  const colors = hat.rarity === 'legendary' ? hat.colors : (hat.variants[variantIdx] ?? hat.variants[0]!);
  return relativeLuminance(colors.A) < 0.18;
}

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 1;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}
