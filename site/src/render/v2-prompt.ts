import type { Route } from '../route.js';
import { chooseV2, markPromptDone, promptDone } from '../v2-opt-in.js';

const NEVER_ON = new Set<Route['type']>(['org-live', 'cli', 'link']);

/** Shown until answered once; kept off the TV view and the sign-in hand-off pages. */
export function shouldPrompt(route: Route['type'], hash: string, storage?: Storage | null): boolean {
  if (NEVER_ON.has(route)) return false;
  if (route === 'org-manager' && /(^#|&)code=/.test(hash)) return false;
  return !promptDone(storage);
}

/** Bottom-right card inviting people to try v2. Either button records the answer. */
export function createV2Prompt(doc: Document, opts: { storage?: Storage | null; go?: (url: string) => void } = {}): HTMLElement {
  const el = doc.createElement('aside');
  el.className = 'v2-prompt';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'v2-prompt-title');
  el.innerHTML = `
    <h2 id="v2-prompt-title">Try the new Token Derby</h2>
    <p>You can switch back any time with the V2 switch at the top right.</p>
    <div class="v2-prompt-actions">
      <button type="button" class="btn v2-prompt-try">Try v2</button>
      <button type="button" class="v2-prompt-later">Not now</button>
    </div>
  `;
  el.querySelector('.v2-prompt-try')!.addEventListener('click', () => { markPromptDone(opts.storage); chooseV2(doc, opts.go); });
  el.querySelector('.v2-prompt-later')!.addEventListener('click', () => { markPromptDone(opts.storage); el.remove(); });
  return el;
}
