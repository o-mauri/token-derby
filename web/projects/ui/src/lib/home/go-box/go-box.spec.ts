import { TestBed } from '@angular/core/testing';
import { GoBox } from './go-box';

async function render(upper = false) {
  const f = TestBed.createComponent(GoBox);
  f.componentRef.setInput('label', 'Organisation name');
  f.componentRef.setInput('placeholder', 'myteam');
  f.componentRef.setInput('pattern', /^[A-Za-z0-9]{1,12}$/);
  f.componentRef.setInput('maxLength', 12);
  f.componentRef.setInput('invalidText', 'Org names are 1–12 letters or digits.');
  f.componentRef.setInput('action', 'Go');
  f.componentRef.setInput('upper', upper);
  const went: string[] = [];
  f.componentInstance.go.subscribe((v) => went.push(v));
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const input = el.querySelector('input')!;
  const type = async (v: string) => { input.value = v; input.dispatchEvent(new Event('input')); await f.whenStable(); };
  const submit = async () => { el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await f.whenStable(); };
  return { el, input, went, type, submit };
}

describe('GoBox', () => {
  it('emits the trimmed value', async () => {
    const b = await render();
    await b.type(' acme ');
    await b.submit();
    expect(b.went).toEqual(['acme']);
  });

  it('upper-cases when asked', async () => {
    const b = await render(true);
    await b.type('abc123');
    await b.submit();
    expect(b.went).toEqual(['ABC123']);
  });

  it('says why a bad value is refused and emits nothing', async () => {
    const b = await render();
    await b.type('bad name!');
    await b.submit();
    expect(b.went).toEqual([]);
    expect(b.el.querySelector('.error')?.textContent).toContain('Org names are 1–12 letters or digits.');
    expect(b.input.getAttribute('aria-invalid')).toBe('true');
  });

  it('clears the error once you edit', async () => {
    const b = await render();
    await b.type('bad!');
    await b.submit();
    await b.type('acme');
    expect(b.el.querySelector('.error')).toBeNull();
  });

  it('labels the box for screen readers', async () => {
    const b = await render();
    expect(b.el.querySelector(`label[for="${b.input.id}"]`)?.textContent).toContain('Organisation name');
  });
});
