import { TestBed } from '@angular/core/testing';
import { Crowd, CROWD_RANDOM } from './crowd';
import { RESIZE_OBSERVER } from '../../layout/resize-observer';

class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  disconnected = false;
  constructor(private readonly cb: ResizeObserverCallback) { FakeResizeObserver.last = this; }
  observe() {}
  disconnect() { this.disconnected = true; }
  resize(width: number) { this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
}

async function render(paused = false) {
  TestBed.configureTestingModule({
    providers: [{ provide: RESIZE_OBSERVER, useValue: FakeResizeObserver }, { provide: CROWD_RANDOM, useValue: () => 0.5 }],
  });
  const f = TestBed.createComponent(Crowd);
  f.componentRef.setInput('paused', paused);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

describe('Crowd', () => {
  it('is decoration, hidden from screen readers', async () => {
    const { el } = await render();
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('fills its width with spectators between two end caps, rounding up', async () => {
    const { f, el } = await render();
    FakeResizeObserver.last!.resize(10 * 96 + 5); // 3x sprite scale: 96px tiles
    await f.whenStable();
    expect(el.querySelectorAll('.cap').length).toBe(2);
    expect(el.querySelectorAll('.person').length).toBe(11 - 2);
  });

  it('gives every spectator its own cheer timing', async () => {
    const { f, el } = await render();
    FakeResizeObserver.last!.resize(500);
    await f.whenStable();
    const p = el.querySelector<HTMLElement>('.person')!;
    expect(p.style.getPropertyValue('--cheer-duration')).toBe('1100ms');
    expect(p.style.getPropertyValue('--cheer-delay')).toBe('-550ms');
  });

  it('keeps existing spectators as it grows', async () => {
    const { f, el } = await render();
    FakeResizeObserver.last!.resize(500);
    await f.whenStable();
    const first = el.querySelector('.person');
    FakeResizeObserver.last!.resize(1500);
    await f.whenStable();
    expect(el.querySelector('.person')).toBe(first);
  });

  it('stops cheering once paused, and stops observing when destroyed', async () => {
    const { f, el } = await render(true);
    expect(el.classList.contains('paused')).toBe(true);
    f.destroy();
    expect(FakeResizeObserver.last!.disconnected).toBe(true);
  });
});
