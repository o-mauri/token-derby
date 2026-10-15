import { chooseV2 } from '../v2-opt-in.js';

/** The V2 switch, shown off on v1. Pressing it opts in and reloads the page as v2. */
export function createV2Toggle(doc: Document, go?: (url: string) => void): HTMLButtonElement {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'v2-toggle';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-checked', 'false');
  btn.title = 'Switch to the new Token Derby';
  btn.innerHTML = '<span class="v2-toggle-track" aria-hidden="true"><span class="v2-toggle-knob"></span></span><span class="v2-toggle-label">V2</span>';
  btn.addEventListener('click', () => chooseV2(doc, go));
  return btn;
}

/** Pages without a header get the switch pinned top-right instead. */
export function mountFloatingV2Toggle(doc: Document, show: boolean): void {
  const existing = doc.querySelector('.v2-toggle-floating');
  if (!show) { existing?.remove(); return; }
  if (existing) return;
  const btn = createV2Toggle(doc);
  btn.classList.add('v2-toggle-floating');
  doc.body.appendChild(btn);
}
