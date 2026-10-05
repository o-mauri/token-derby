import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Panel } from './panel';

@Component({
  imports: [Panel],
  template: `<td-panel spine="LIVE" [link]="link()" [disabled]="disabled()"><p class="inside">content</p></td-panel>`,
})
class Host {
  readonly link = input<readonly string[] | null>(null);
  readonly disabled = input(false);
}

async function render(inputs: { link?: readonly string[] | null; disabled?: boolean } = {}) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(Host);
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('Panel', () => {
  it('shows the spine and the projected content', async () => {
    const el = await render();
    expect(el.querySelector('.spine')?.textContent?.trim()).toBe('LIVE');
    expect(el.querySelector('.body .inside')?.textContent).toBe('content');
  });

  it('is a real link when given one', async () => {
    const el = await render({ link: ['/race', 'K7QX'] });
    const a = el.querySelector('a.frame');
    expect(a?.getAttribute('href')).toBe('/race/K7QX');
    expect(a?.querySelector('.inside')).not.toBeNull();
  });

  it('is not a link without one', async () => {
    const el = await render();
    expect(el.querySelector('a')).toBeNull();
  });

  it('is greyed and inert when disabled, even with a link', async () => {
    const el = await render({ link: ['/x'], disabled: true });
    expect(el.querySelector('a')).toBeNull();
    const frame = el.querySelector('.frame')!;
    expect(frame.getAttribute('aria-disabled')).toBe('true');
    expect(el.querySelector('td-panel')!.classList.contains('disabled')).toBe(true);
  });
});
