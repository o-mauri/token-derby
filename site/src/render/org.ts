import type { RaceSummary } from '@token-derby/shared';
import { fetchOrgRaces, ApiError } from '../api.js';
import { horseFaceSvg } from '../horse-face.js';

export function renderOrg(root: HTMLElement, orgName: string): () => void {
  root.innerHTML = '';
  const section = root.ownerDocument.createElement('section');
  section.className = 'org';
  section.innerHTML = `
    <header class="org-header">
      <h1>${horseFaceSvg()} <span class="org-name">${escapeHtml(orgName)}</span></h1>
      <div class="meta"><button type="button" class="btn home-btn">← Home</button></div>
    </header>
    <div class="org-body"><p class="org-status">Loading…</p></div>
  `;
  root.appendChild(section);

  const body = section.querySelector<HTMLElement>('.org-body')!;
  const homeBtn = section.querySelector<HTMLButtonElement>('.home-btn')!;
  homeBtn.addEventListener('click', () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  const ctrl = new AbortController();

  fetchOrgRaces(orgName).then((res) => {
    if (ctrl.signal.aborted) return;
    const nameEl = section.querySelector<HTMLElement>('.org-name')!;
    nameEl.textContent = res.org_name;
    renderRaceList(body, res.races);
  }).catch((err: unknown) => {
    if (ctrl.signal.aborted) return;
    if (err instanceof ApiError && err.code === 'ORG_NOT_FOUND') {
      body.innerHTML = `<p class="org-status">No organisation named <b>${escapeHtml(orgName)}</b>.</p>`;
      return;
    }
    body.innerHTML = `<p class="org-status">Couldn't load races. Try again later.</p>`;
  });

  return () => ctrl.abort();
}

function renderRaceList(body: HTMLElement, races: RaceSummary[]): void {
  const live = races.filter(r => r.status === 'live');
  const pending = races.filter(r => r.status === 'pending');
  const finished = races.filter(r => r.status === 'finished');

  if (races.length === 0) {
    body.innerHTML = `<p class="org-status">No races yet. Create one with <code>token-derby create</code>.</p>`;
    return;
  }

  body.innerHTML = [
    renderSection('Live', live),
    renderSection('Upcoming', pending),
    renderSection('Finished', finished),
  ].filter(Boolean).join('');
}

function renderSection(title: string, races: RaceSummary[]): string {
  if (races.length === 0) return '';
  const items = races.map(r => `
    <li class="race-card">
      <a href="/race/${encodeURIComponent(r.join_code)}">
        <span class="race-card-name">${escapeHtml(r.name)}</span>
        <span class="race-card-meta">
          <span class="race-card-code">${escapeHtml(r.join_code)}</span>
          <span class="race-card-time">${formatStart(r)}</span>
        </span>
      </a>
    </li>
  `).join('');
  return `
    <section class="org-section">
      <h2>${title}</h2>
      <ul class="race-list">${items}</ul>
    </section>
  `;
}

function formatStart(r: RaceSummary): string {
  const d = new Date(r.start_time);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}
