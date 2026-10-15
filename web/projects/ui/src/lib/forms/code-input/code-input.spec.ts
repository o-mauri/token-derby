import { TestBed } from '@angular/core/testing';
import { CodeInput } from './code-input';

async function render() {
  const f = TestBed.createComponent(CodeInput);
  f.componentRef.setInput('label', 'Code from your terminal');
  document.body.append(f.nativeElement);
  await f.whenStable();
  const cells = () => [...(f.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input.cell')];
  const paste = async (text: string) => {
    const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(e, 'clipboardData', { value: { getData: () => text } });
    cells()[0]!.dispatchEvent(e);
    await f.whenStable();
  };
  return { f, cells, paste, value: () => f.componentInstance.value() };
}

describe('CodeInput', () => {
  it('has six labelled boxes', async () => {
    const { cells } = await render();
    expect(cells()).toHaveLength(6);
    expect(cells()[2]!.getAttribute('aria-label')).toBe('Character 3 of 6');
  });

  it('upper-cases a typed character and moves on', async () => {
    const { cells, value, f } = await render();
    cells()[0]!.value = 'k';
    cells()[0]!.dispatchEvent(new Event('input'));
    await f.whenStable();
    expect(value()).toBe('K');
    expect(document.activeElement).toBe(cells()[1]);
  });

  it.each([['k7q-x2m', 'K7QX2M'], [' K7 QX 2M9 ', 'K7QX2M'], ['O0I1AB', 'AB']])('cleans a paste of "%s" to "%s"', async (raw, out) => {
    const { paste, value } = await render();
    await paste(raw);
    expect(value()).toBe(out);
  });

  it('moves back on Backspace in an empty box', async () => {
    const { cells, paste, f } = await render();
    await paste('K7');
    cells()[2]!.focus();
    cells()[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    await f.whenStable();
    expect(document.activeElement).toBe(cells()[1]);
  });

  it('keeps the other characters in place when a middle box is cleared', async () => {
    const { cells, paste, value, f } = await render();
    await paste('K7QX2M');
    cells()[2]!.value = '';
    cells()[2]!.dispatchEvent(new Event('input'));
    await f.whenStable();
    expect(cells().map((c) => c.value)).toEqual(['K', '7', '', 'X', '2', 'M']);
    expect(value()).toBe('K7X2M');
    cells()[2]!.value = 'Q';
    cells()[2]!.dispatchEvent(new Event('input'));
    await f.whenStable();
    expect(value()).toBe('K7QX2M');
  });

  it('puts a character in the box you typed it in', async () => {
    const { cells, f } = await render();
    cells()[3]!.value = 'x';
    cells()[3]!.dispatchEvent(new Event('input'));
    await f.whenStable();
    expect(cells().map((c) => c.value)).toEqual(['', '', '', 'X', '', '']);
  });

  it('selects a box when it gets focus, so typing replaces it', async () => {
    const { cells, paste } = await render();
    await paste('K7QX2M');
    cells()[1]!.focus();
    cells()[1]!.dispatchEvent(new FocusEvent('focus'));
    expect([cells()[1]!.selectionStart, cells()[1]!.selectionEnd]).toEqual([0, 1]);
  });
});
