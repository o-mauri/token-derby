import { TestBed } from '@angular/core/testing';
import { Clipboard } from '@angular/cdk/clipboard';
import { CopyField } from './copy-field';

describe('CopyField', () => {
  const copy = vi.fn(() => true);
  beforeEach(() => {
    copy.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: Clipboard, useValue: { copy } }] });
  });
  afterEach(() => vi.useRealTimers());

  async function render() {
    const f = TestBed.createComponent(CopyField);
    f.componentRef.setInput('label', 'Join token');
    f.componentRef.setInput('value', 'tok_abc123');
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    return { f, el, btn: el.querySelector('button')! };
  }

  it('shows the value read-only with a labelled copy button', async () => {
    const { el, btn } = await render();
    expect(el.querySelector('code')?.textContent).toBe('tok_abc123');
    expect(el.querySelector('.label')?.textContent).toBe('Join token');
    expect(btn.textContent?.trim()).toBe('Copy');
    expect(btn.getAttribute('aria-label')).toBe('Copy join token');
  });

  it('copies through the CDK clipboard, confirms, and resets after 1.5s', async () => {
    const { f, el, btn } = await render();
    let copied = 0;
    f.componentInstance.copied.subscribe(() => copied++);
    // Only the reset delay is faked; Angular's own scheduling stays real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    btn.click();
    f.detectChanges();
    expect(copy).toHaveBeenCalledWith('tok_abc123');
    expect(copied).toBe(1);
    expect(btn.textContent?.trim()).toBe('Copied');
    expect(el.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('Copied');
    vi.advanceTimersByTime(1499);
    f.detectChanges();
    expect(btn.textContent?.trim()).toBe('Copied');
    vi.advanceTimersByTime(1);
    f.detectChanges();
    expect(btn.textContent?.trim()).toBe('Copy');
  });

  it('does not claim success when the copy fails', async () => {
    copy.mockReturnValueOnce(false);
    const { f, btn } = await render();
    let copied = 0;
    f.componentInstance.copied.subscribe(() => copied++);
    btn.click();
    await f.whenStable();
    expect(copied).toBe(0);
    expect(btn.textContent?.trim()).toBe('Copy failed');
  });
});
