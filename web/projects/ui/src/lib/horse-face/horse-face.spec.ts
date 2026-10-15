import { TestBed } from '@angular/core/testing';
import { FACE_ROWS, HorseFace } from './horse-face';

async function render(colors?: Record<string, string>) {
  const f = TestBed.createComponent(HorseFace);
  if (colors) f.componentRef.setInput('colors', colors);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('HorseFace', () => {
  it('draws the pixel horse head, hidden from screen readers', async () => {
    const svg = (await render()).querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 8 10');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('rect').length).toBe(FACE_ROWS.join('').replace(/\./g, '').length);
  });

  it('keeps today\'s colours by default', async () => {
    const el = await render();
    expect(el.style.getPropertyValue('--face-body')).toBe('#8B4513');
    expect(el.style.getPropertyValue('--face-mane')).toBe('#f5e9d3');
    expect(el.style.getPropertyValue('--face-eye')).toBe('#000000');
  });

  it('can be recoloured part by part, keeping defaults for parts not given', async () => {
    const el = await render({ body: '#1E40AF', mane: '#FFD700' });
    expect(el.style.getPropertyValue('--face-body')).toBe('#1E40AF');
    expect(el.style.getPropertyValue('--face-mane')).toBe('#FFD700');
    expect(el.style.getPropertyValue('--face-eye')).toBe('#000000');
  });

  it('paints each pixel from its part', async () => {
    const fills = new Set([...(await render()).querySelectorAll('rect')].map((r) => r.getAttribute('fill')));
    expect(fills).toEqual(new Set(['var(--face-body)', 'var(--face-mane)', 'var(--face-eye)']));
  });
});
