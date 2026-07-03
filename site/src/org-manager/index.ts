import * as api from './api.js';
import { ApiError } from './api.js';
import { getSession, getUid, setUid, clearSession, readCodeFromHash } from './session.js';
import { renderLogin } from './render/login.js';
import { renderSidebar } from './render/sidebar.js';
import { renderOverview } from './render/tabs/overview.js';
import { renderMembers } from './render/tabs/members.js';
import { renderSchedule } from './render/tabs/schedule.js';
import { renderWebhook } from './render/tabs/webhook.js';
import type { OrganisationSummary } from '@token-derby/shared';

type Tab = 'overview' | 'members' | 'schedule' | 'webhook';

export function renderOrgManager(root: HTMLElement): () => void {
  let disposed = false;

  const showLogin = () => { if (!disposed) renderLogin(root); };

  const boot = async () => {
    // 1. If arriving from the CLI with a code, exchange it for a session.
    const code = readCodeFromHash();
    if (code) {
      try {
        const res = await api.exchangeCode(code);
        setUid(res.user.user_id);
      } catch { showLogin(); return; }
    }
    if (!getSession()) { showLogin(); return; }

    // 2. Load org list and render the shell.
    let orgs: OrganisationSummary[];
    try { ({ organisations: orgs } = await api.listOrganisations()); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) clearSession();
      showLogin();
      return;
    }

    let selected: string | null = orgs[0]?.org_name ?? null;
    let tab: Tab = 'overview';
    const ownerOrgs = new Set<string>();

    root.innerHTML = `<div class="org-manager"><div class="org-side"></div><div class="org-main"></div></div>`;
    const sideEl = root.querySelector<HTMLElement>('.org-side')!;
    const mainEl = root.querySelector<HTMLElement>('.org-main')!;

    const drawSidebar = () => renderSidebar(sideEl, {
      orgs, selected, ownerOrgs,
      onSelect: (name) => { selected = name; tab = 'overview'; void drawMain(); drawSidebar(); },
      onCreate: async () => {
        const name = prompt('New organisation name (1–12 alphanumeric):')?.trim();
        if (!name) return;
        try { await api.createOrganisation(name); location.reload(); } catch (e) { alert(String((e as Error).message)); }
      },
      onJoin: async () => {
        const token = prompt('Join token:')?.trim();
        if (!token) return;
        try { await api.joinOrganisation(token); location.reload(); } catch (e) { alert(String((e as Error).message)); }
      },
      onLogout: async () => { await api.logout(); showLogin(); },
    });

    const drawMain = async () => {
      if (!selected) { mainEl.innerHTML = '<p class="muted">Create or join an organisation to begin.</p>'; return; }
      const name = selected;
      mainEl.innerHTML = `
        <nav class="org-tabs">
          ${(['overview', 'members', 'schedule', 'webhook'] as Tab[]).map((t) =>
            `<button type="button" class="org-tab${t === tab ? ' on' : ''}" data-tab="${t}">${t}</button>`).join('')}
        </nav>
        <div class="org-tabbody"></div>`;
      mainEl.querySelectorAll<HTMLElement>('.org-tab').forEach((el) =>
        el.addEventListener('click', () => { tab = el.dataset.tab as Tab; void drawMain(); }));
      const bodyEl = mainEl.querySelector<HTMLElement>('.org-tabbody')!;

      try {
        // The org record tells us ownership; every tab needs it.
        const org = await api.getOrganisation(name);
        const isOwner = org.creator_user_id === (await currentUserId());
        ownerOrgs[isOwner ? 'add' : 'delete'](name);
        drawSidebar();

        if (tab === 'overview') renderOverview(bodyEl, { org });
        else if (tab === 'members') renderMembers(bodyEl, { members: (await api.getMembers(name)).members });
        else if (tab === 'schedule') {
          // Schedule GET is owner-only server-side; non-owners just see the disabled form.
          const schedule = isOwner ? ((await api.getSchedule(name)).schedule ?? null) : null;
          renderSchedule(bodyEl, {
            schedule, isOwner,
            onSave: async (b) => { try { await api.setSchedule(name, b); void drawMain(); } catch (e) { alert(String((e as Error).message)); } },
            onClear: async () => { try { await api.clearSchedule(name); void drawMain(); } catch (e) { alert(String((e as Error).message)); } },
          });
        }
        else if (tab === 'webhook') {
          // Webhook GET is owner-only server-side; non-owners just see the empty form disabled.
          let webhook = null as Awaited<ReturnType<typeof api.getWebhook>> | null;
          if (isOwner) { try { webhook = await api.getWebhook(name); } catch { webhook = null; } }
          const onSave = async (url: string) => {
            try { const r = await api.setWebhook(name, url); webhook = { webhook_url: r.webhook_url }; drawWebhook(r.webhook_secret); }
            catch (e) { alert(String((e as Error).message)); }
          };
          const onClear = async () => { try { await api.clearWebhook(name); void drawMain(); } catch (e) { alert(String((e as Error).message)); } };
          const drawWebhook = (lastSecret?: string) => renderWebhook(bodyEl, { webhook, isOwner, lastSecret, onSave, onClear });
          drawWebhook();
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { clearSession(); showLogin(); return; }
        bodyEl.innerHTML = '<p class="muted">Failed to load. Try again.</p>';
      }
    };

    drawSidebar();
    await drawMain();
  };

  // The signed-in user's id, cached from the exchange or re-derived from list order.
  let cachedUserId: string | null = null;
  async function currentUserId(): Promise<string> {
    if (cachedUserId) return cachedUserId;
    cachedUserId = getUid();
    return cachedUserId ?? '';
  }

  void boot();
  return () => { disposed = true; };
}
