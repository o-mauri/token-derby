import * as api from './api.js';
import { ApiError } from './api.js';
import { getSession, getUid, setUid, getLinkedEmail, setLinkedEmail, clearLinkedEmail, clearSession, readCodeFromHash } from './session.js';
import { renderLogin, authErrorMessage } from './render/login.js';
import { esc } from '../esc.js';
import { renderSidebar } from './render/sidebar.js';
import { renderOverview } from './render/tabs/overview.js';
import { renderMembers } from './render/tabs/members.js';
import { renderRacing } from './render/tabs/racing.js';
import { renderWebhook } from './render/tabs/webhook.js';
import { renderSlackbot } from './render/tabs/slackbot.js';
import { renderRaceSettings } from './render/tabs/race-settings.js';
import { renderAccount } from './render/account.js';
import type { OrganisationSummary } from '@token-derby/shared';

type Tab = 'overview' | 'members' | 'racing' | 'webhook' | 'slackbot' | 'race-settings';
type View = 'org' | 'account';

/** Exported so the link chain can be tested — it is the only route an existing
 *  CLI user has to link, and a silent failure here is invisible. */
export async function startGoogleLink(): Promise<void> {
  try {
    const { authorize_url } = await api.linkStart();
    window.location.assign(authorize_url);
  } catch (e) { alert(String((e as Error).message)); }
}

/** Reads `?auth_error=` and strips it, so a reload does not re-show the error. */
function consumeAuthError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('auth_error');
  if (!code) return null;
  params.delete('auth_error');
  const query = params.toString();
  history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
  return code;
}

export function renderOrgManager(root: HTMLElement): () => void {
  let disposed = false;

  const authError = consumeAuthError();
  const showLogin = () => { if (!disposed) renderLogin(root, { authError }); };

  const boot = async () => {
    // 1. If arriving from the CLI with a code, exchange it for a session.
    const code = readCodeFromHash();
    if (code) {
      try {
        const res = await api.exchangeCode(code);
        setUid(res.user.user_id);
        if (res.user.email) setLinkedEmail(res.user.email); else clearLinkedEmail();
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
    let view: View = 'org';
    const ownerOrgs = new Set<string>();

    // The link flow always runs with a session, so its errors have to land here
    // and not only on the signed-out screen.
    const banner = authErrorMessage(authError);
    root.innerHTML = `${banner ? `<p class="org-auth-error">${esc(banner)}</p>` : ''}`
      + `<div class="org-manager"><div class="org-side"></div><div class="org-main"></div></div>`;
    const sideEl = root.querySelector<HTMLElement>('.org-side')!;
    const mainEl = root.querySelector<HTMLElement>('.org-main')!;

    const linkedEmail = getLinkedEmail();
    const drawSidebar = () => renderSidebar(sideEl, {
      orgs, selected, ownerOrgs, linkedEmail, view,
      onSelect: (name) => { selected = name; tab = 'overview'; view = 'org'; void drawMain(); drawSidebar(); },
      onAccount: () => { view = 'account'; void drawMain(); drawSidebar(); },
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
      onLinkGoogle: startGoogleLink,
      onLogout: async () => { await api.logout(); showLogin(); },
    });

    // Account is a sidebar-level view, not an org tab: it must render with no
    // organisations selected, which the org tabs below cannot (they all
    // return early without one). See render/account.ts.
    const drawAccount = async () => {
      try {
        const { devices, has_legacy_credential } = await api.listDevices();
        renderAccount(mainEl, {
          email: linkedEmail,
          devices,
          hasLegacyCredential: has_legacy_credential,
          onRevoke: (deviceId) => {
            void (async () => {
              try { await api.deleteDevice(deviceId); await drawAccount(); }
              catch (e) { alert(String((e as Error).message)); }
            })();
          },
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { clearSession(); showLogin(); return; }
        mainEl.innerHTML = '<p class="muted">Failed to load. Try again.</p>';
      }
    };

    const drawMain = async () => {
      if (view === 'account') { await drawAccount(); return; }
      if (!selected) {
        // Names `login`, never `init` — init would mint a SECOND jockey for an
        // account that already exists, which is the duplicate this whole design
        // prevents. Racing needs a linked machine, so say so here.
        mainEl.innerHTML = `
          <div class="org-empty">
            <p>Create or join an organisation to begin.</p>
            <p class="muted">To race, link a machine by running
              <code>token-derby login</code> in your terminal, then approve it at
              <a href="/cli">/cli</a>.</p>
          </div>`;
        return;
      }
      const name = selected;
      mainEl.innerHTML = `
        <nav class="org-tabs">
          ${(['overview', 'members', 'racing', 'race-settings', 'webhook', 'slackbot'] as Tab[]).map((t) =>
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
        else if (tab === 'racing') {
          // Schedule + league GETs are owner-only server-side; non-owners see a read-only mode view.
          const schedule = isOwner ? ((await api.getSchedule(name)).schedule ?? null) : null;
          const league = isOwner ? ((await api.getLeague(name)).league ?? null) : null;
          const guard = async (fn: () => Promise<unknown>) => {
            try { await fn(); void drawMain(); } catch (e) { alert(String((e as Error).message)); }
          };
          renderRacing(bodyEl, {
            schedule, league, isOwner,
            // Mutual exclusivity: clear the other mode (after a confirm) before saving the chosen one.
            onSaveSchedule: (b) => {
              if (league && !confirm('This will replace the current league with a race schedule. Continue?')) return;
              void guard(async () => { if (league) await api.clearLeague(name); await api.setSchedule(name, b); });
            },
            onClearSchedule: () => void guard(() => api.clearSchedule(name)),
            onSaveLeague: (b) => {
              if (schedule && !confirm('This will replace the current race schedule with a league. Continue?')) return;
              void guard(async () => { if (schedule) await api.clearSchedule(name); await api.setLeague(name, b); });
            },
            onClearLeague: () => void guard(() => api.clearLeague(name)),
          });
        }
        else if (tab === 'race-settings') {
          const settings = isOwner ? ((await api.getRaceSettings(name)).settings ?? null) : null;
          const schedule = isOwner ? ((await api.getSchedule(name)).schedule ?? null) : null;
          const league = isOwner ? ((await api.getLeague(name)).league ?? null) : null;
          const staminaOn = Boolean(league?.stamina ?? schedule?.stamina);
          const guard = async (fn: () => Promise<unknown>) => {
            try { await fn(); void drawMain(); } catch (e) { alert(String((e as Error).message)); }
          };
          renderRaceSettings(bodyEl, {
            settings, staminaOn, isOwner,
            onSave: (b) => void guard(() => api.setRaceSettings(name, b)),
            onReset: () => void guard(() => api.setRaceSettings(name, {})),
            onToggleStamina: (on) => void guard(() => {
              if (league) return api.setLeague(name, { ...league, stamina: on });
              if (schedule) return api.setSchedule(name, { ...schedule, stamina: on });
              alert('Set up scheduled races or a league on the Racing tab first.');
              return Promise.resolve();
            }),
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
        else if (tab === 'slackbot') {
          // Slack GET is owner-only server-side; non-owners just see the empty form disabled.
          let slack = null as Awaited<ReturnType<typeof api.getSlack>> | null;
          if (isOwner) { try { slack = await api.getSlack(name); } catch { slack = null; } }
          const onSave = async (body: Parameters<typeof api.setSlack>[1]) => {
            try { slack = await api.setSlack(name, body); renderSlackbot(bodyEl, { slack, isOwner, onSave, onClear }); }
            catch (e) { alert(String((e as Error).message)); }
          };
          const onClear = async () => { try { await api.clearSlack(name); void drawMain(); } catch (e) { alert(String((e as Error).message)); } };
          renderSlackbot(bodyEl, { slack, isOwner, onSave, onClear });
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
