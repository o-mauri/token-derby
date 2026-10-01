// site/src/derbymarket/render/picker.ts
// The market's own pages around the board: the org picker, an org with no
// races yet, and the porthole not-found.
import type { RaceSummary } from '@token-derby/shared';
import { esc } from '../../esc.js';
import { createNotFound, type NotFoundOptions } from '../../render/not-found.js';

export type PickerEntry = { org_name: string; live: RaceSummary | null; next: RaceSummary | null };

const ORG_NAME = /^[A-Za-z0-9]{1,12}$/;

export function nextPendingRace(races: RaceSummary[], nowMs: number): RaceSummary | null {
  return races
    .filter((r) => r.status === 'pending' && Date.parse(r.start_time) > nowMs)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))[0] ?? null;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function renderPickerSignedIn(root: HTMLElement, entries: PickerEntry[], href: (path: string) => string): void {
  const cards = entries.map((e) => {
    const badge = e.live ? '<span class="dm-pill dm-pill--live">LIVE</span>' : '<span class="dm-pill">NO RACE</span>';
    const detail = e.live ? esc(e.live.name) : e.next ? `Next race ${esc(when(e.next.start_time))}` : 'No race scheduled';
    return `
      <div class="dm-org-card">
        <div class="dm-org-card-main"><b>${esc(e.org_name)}</b> ${badge}<div class="dm-org-card-detail">${detail}</div></div>
        <a class="dm-org-open" href="${esc(href(`/${encodeURIComponent(e.org_name)}`))}">Open market</a>
      </div>`;
  }).join('');
  root.innerHTML = `
    <section class="dm dm-picker">
      <div class="dm-brand">DERBYMARKET</div>
      <div class="dm-section-head">Your organisations</div>
      ${cards || '<p>You are not in any organisations yet.</p>'}
    </section>`;
}

export function renderPickerSignedOut(root: HTMLElement, onGo: (orgName: string) => void): void {
  root.innerHTML = `
    <section class="dm dm-picker">
      <div class="dm-brand">DERBYMARKET</div>
      <p>Live odds on your organisation's Token Derby race, from 10,000 simulated finishes that follow who usually races when.</p>
      <form class="dm-org-form">
        <label class="dm-section-head" for="dm-org-input">Go to an organisation</label>
        <div class="dm-org-form-row">
          <input id="dm-org-input" name="org" autocomplete="off" placeholder="organisation name">
          <button type="submit">Open</button>
        </div>
        <p class="dm-picker-error" hidden></p>
      </form>
      <div class="dm-section-head">Racing? Sign in from your terminal</div>
      <pre class="cmd">token-derby derbymarket</pre>
      <p class="dm-muted">Signing in shows who usually races but hasn't joined yet.</p>
    </section>`;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const input = root.querySelector<HTMLInputElement>('#dm-org-input')!;
  const error = root.querySelector<HTMLElement>('.dm-picker-error')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!ORG_NAME.test(name)) {
      error.textContent = 'Organisation names are 1 to 12 letters and numbers.';
      error.hidden = false;
      return;
    }
    onGo(name);
  });
}

export function renderNoRaces(root: HTMLElement, orgName: string, next: RaceSummary | null): void {
  root.innerHTML = `
    <section class="dm dm-empty">
      <div class="dm-brand">DERBYMARKET <span class="dm-brand-org">· ${esc(orgName)}</span></div>
      <h2>No races yet for ${esc(orgName)}</h2>
      <p>${next ? `Next race: ${esc(next.name)}, ${esc(when(next.start_time))}.` : 'No race scheduled.'}</p>
    </section>`;
}

export type MissingThing = { org: string } | { race: string } | null;

export function renderMarketNotFound(root: HTMLElement, missing: MissingThing, href: (path: string) => string): void {
  const doc = root.ownerDocument;
  const section = doc.createElement('section');
  section.className = 'dm';
  section.innerHTML = '<div class="dm-brand">DERBYMARKET</div>';
  section.append(createNotFound(doc, notFoundCopy(missing, href('/'))));
  root.replaceChildren(section);
}

function notFoundCopy(missing: MissingThing, home: string): NotFoundOptions {
  const back = { label: '← All markets', href: home };
  if (missing && 'org' in missing) {
    return { title: 'Organisation not found', message: ['No organisation named ', { strong: missing.org }, '.'], back };
  }
  if (missing) return { title: 'Race not found', message: ['No race with code ', { strong: missing.race }, '.'], back };
  return { title: 'Page not found', message: ["There's nothing at this address."], back };
}
