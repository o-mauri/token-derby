import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { pollResource } from './poll-resource';

type Race = { code: string; n: number; finished?: boolean };

@Component({ template: '' })
class Host {
  code = signal<string | null>('ABC');
  calls: string[] = [];
  responses: Array<(code: string) => Promise<Race>> = [];
  poll = pollResource({
    params: () => this.code(),
    loader: (code: string) => {
      this.calls.push(code);
      const next = this.responses.shift();
      return next ? next(code) : Promise.resolve({ code, n: this.calls.length });
    },
    intervalMs: 1000,
    until: (r: Race) => !!r.finished,
  });
}

const flush = () => new Promise<void>((r) => queueMicrotask(r)).then(() => new Promise<void>((r) => queueMicrotask(r)));

describe('pollResource', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  async function start() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    await flush();
    return f;
  }

  it('polls straight away and exposes the value', async () => {
    const f = await start();
    expect(f.componentInstance.calls).toEqual(['ABC']);
    expect(f.componentInstance.poll.value()).toEqual({ code: 'ABC', n: 1 });
    expect(f.componentInstance.poll.status()).toBe('resolved');
  });

  it('polls again once the interval has passed after the last response', async () => {
    const f = await start();
    await vi.advanceTimersByTimeAsync(999);
    expect(f.componentInstance.calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(f.componentInstance.calls.length).toBe(2);
    expect(f.componentInstance.poll.value()!.n).toBe(2);
  });

  it('keeps polling after an error, keeping the last good value', async () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.responses.push(() => Promise.reject(new Error('down')));
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0); await flush();
    expect(f.componentInstance.poll.error()).toEqual(new Error('down'));
    expect(f.componentInstance.poll.status()).toBe('error');
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(f.componentInstance.poll.value()!.n).toBe(2);
    expect(f.componentInstance.poll.error()).toBeUndefined();
  });

  it('stops once the value says so (a finished race)', async () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.responses.push((code) => Promise.resolve({ code, n: 1, finished: true }));
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0); await flush();
    await vi.advanceTimersByTimeAsync(5000); await flush();
    expect(f.componentInstance.calls.length).toBe(1);
  });

  it('restarts for new params and ignores a response for the old ones', async () => {
    const f = TestBed.createComponent(Host);
    let resolveOld!: (r: Race) => void;
    f.componentInstance.responses.push(() => new Promise<Race>((r) => (resolveOld = r)));
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    f.componentInstance.code.set('XYZ');
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0); await flush();
    resolveOld({ code: 'ABC', n: 99 });
    await flush();
    expect(f.componentInstance.poll.value()!.code).toBe('XYZ');
  });

  it('does nothing without params, and stops when destroyed', async () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.code.set(null);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(3000); await flush();
    expect(f.componentInstance.calls).toEqual([]);
    f.componentInstance.code.set('ABC');
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0); await flush();
    f.destroy();
    await vi.advanceTimersByTimeAsync(5000); await flush();
    expect(f.componentInstance.calls.length).toBe(1);
  });

  it('can pick each wait from the latest value', async () => {
    @Component({ template: '' })
    class Paced {
      calls = 0;
      poll = pollResource({
        params: () => 'X',
        loader: () => Promise.resolve(++this.calls),
        // Quick while the count is low, slow after.
        intervalMs: (n: number | undefined) => ((n ?? 0) < 2 ? 1000 : 10_000),
      });
    }
    const f = TestBed.createComponent(Paced);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0); await flush();
    expect(f.componentInstance.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(f.componentInstance.calls).toBe(2);
    await vi.advanceTimersByTimeAsync(9999); await flush();
    expect(f.componentInstance.calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1); await flush();
    expect(f.componentInstance.calls).toBe(3);
  });

  it('forgets the old value and error as soon as the params change', async () => {
    const f = await start();
    expect(f.componentInstance.poll.value()?.code).toBe('ABC');
    f.componentInstance.code.set('XYZ');
    TestBed.tick();
    expect(f.componentInstance.poll.value()).toBeUndefined();
    expect(f.componentInstance.poll.error()).toBeUndefined();
    expect(f.componentInstance.poll.status()).not.toBe('resolved');
  });
});
