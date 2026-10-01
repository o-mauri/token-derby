import { buildHorseSvg } from '../sprite-svg.js';

// Full-page loading indicator: two horses trading the lead on a scrolling track,
// seen through a porthole with a spinner arc round it. All motion is in styles.css.

const HORSES = [
  { cls: 'far', colors: { body: '#d9d4cc', mane: '#5b5650', tail: '#5b5650', saddle: '#3b82f6' } },
  { cls: 'near', colors: { body: '#8B4513', mane: '#2b1a0e', tail: '#2b1a0e', saddle: '#d94848' } },
] as const;

export function createLoader(doc: Document): HTMLElement {
  const loader = doc.createElement('div');
  loader.className = 'loader';
  loader.setAttribute('role', 'status');
  loader.innerHTML = `
    <div class="loader-ring"><div class="loader-porthole"><div class="loader-track"></div></div></div>
    <div class="loader-caption">Loading…</div>
  `;

  const track = loader.querySelector<HTMLElement>('.loader-track')!;
  for (const { cls, colors } of HORSES) {
    const horse = doc.createElement('div');
    horse.className = `loader-horse ${cls}`;
    for (const [slot, color] of Object.entries(colors)) horse.style.setProperty(`--${slot}`, color);
    const dust = doc.createElement('span');
    dust.className = 'horse-dust';
    horse.append(dust, buildHorseSvg(doc));
    track.appendChild(horse);
  }
  return loader;
}
