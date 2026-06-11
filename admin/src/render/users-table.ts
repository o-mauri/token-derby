import type { AdminUser, StableHorse } from '@token-derby/shared';
import { hatById } from '@token-derby/shared';
import { formatTokens, avgFinish } from '../format.js';
import { esc } from '../esc.js';

export type UsersTableMutations = {
  renameUser: (userId: string, name: string) => Promise<{ user_id: string; display_name: string }>;
  renameHorse: (userId: string, horseId: string, name: string) => Promise<StableHorse>;
  removeHat: (userId: string, horseId: string, index: number) => Promise<StableHorse>;
  deleteHorse: (userId: string, horseId: string) => Promise<void>;
};

export type UsersTableOptions = {
  users: AdminUser[];
  editMode: boolean;
  mutations: UsersTableMutations;
  onUnauthorized: () => void;
  confirmFn?: (msg: string) => boolean;
};

export type UsersTableHandle = { setEditMode: (on: boolean) => void };

export function renderUsersTable(container: HTMLElement, opts: UsersTableOptions): UsersTableHandle {
  const data: AdminUser[] = opts.users.map((usr) => ({ ...usr, horses: [...usr.horses] }));
  let editMode = opts.editMode;
  let busy = false;
  const confirmFn = opts.confirmFn ?? ((m: string) => window.confirm(m));
  const expandedUsers = new Set<string>();
  const expandedHats = new Set<string>();   // `${uid}::${hid}`
  let editing: string | null = null;        // `user:${uid}` | `horse:${uid}::${hid}`

  const hatKey = (uid: string, hid: string) => `${uid}::${hid}`;
  const findUser = (uid: string) => data.find((usr) => usr.user_id === uid);
  const findHorse = (uid: string, hid: string) => findUser(uid)?.horses.find((h) => h.stable_horse_id === hid);

  function hatRowsHtml(h: StableHorse, uid: string): string {
    const rows = (h.hats ?? []).map((ch, i) => ({ ch, i }));
    rows.sort((a, b) => (b.ch.obtained_at ?? '').localeCompare(a.ch.obtained_at ?? ''));
    if (rows.length === 0) return `<div class="muted" style="padding:6px 8px">No hats.</div>`;
    return rows.map(({ ch, i }) => {
      const def = hatById(ch.id);
      const name = def ? def.name : ch.id;
      const rarity = def ? def.rarity : 'common';
      const equipped = h.equipped_hat === i ? `<span class="hat-eq">equipped</span>` : '';
      const when = ch.obtained_at ? `<span class="hat-when">obtained ${esc(ch.obtained_at.slice(0, 10))}</span>` : '';
      const remove = editMode
        ? `<button class="hat-remove" data-action="remove-hat" data-uid="${esc(uid)}" data-hid="${esc(h.stable_horse_id)}" data-index="${i}">✕ remove</button>`
        : '';
      return `<div class="hat-row"><span class="hat-name">${esc(name)}</span><span class="rarity r-${rarity}">${rarity}</span>${equipped}${when}${remove}</div>`;
    }).join('');
  }

  function horseNameHtml(h: StableHorse, uid: string): string {
    const key = `horse:${hatKey(uid, h.stable_horse_id)}`;
    if (editMode && editing === key) {
      return `<span class="editable"><input class="inline-input" data-edit-input value="${esc(h.name)}"><button class="mini save" data-action="save-horse-name" data-uid="${esc(uid)}" data-hid="${esc(h.stable_horse_id)}">save</button><button class="mini cancel" data-action="cancel-edit">cancel</button></span>`;
    }
    const pencil = editMode ? `<span class="pencil" data-action="edit-horse-name" data-uid="${esc(uid)}" data-hid="${esc(h.stable_horse_id)}">✎</span>` : '';
    return `<span class="editable"><span class="hname">${esc(h.name)}</span>${pencil}</span>`;
  }

  function horseCardHtml(h: StableHorse, uid: string): string {
    const open = expandedHats.has(hatKey(uid, h.stable_horse_id));
    const del = editMode ? `<div class="hcard-actions"><button class="btn-danger" data-action="delete-horse" data-uid="${esc(uid)}" data-hid="${esc(h.stable_horse_id)}">Delete horse</button></div>` : '';
    const count = h.hats?.length ?? 0;
    const panel = open ? `<div class="hats-panel">${hatRowsHtml(h, uid)}</div>` : '';
    return `
      <div class="hcard">
        <div class="hcard-top">
          <span class="swatch" style="background:${esc(h.colors.body)}"></span>
          ${horseNameHtml(h, uid)}
          <div class="hstats">
            <span class="chip">RACES <b>${h.races_entered ?? 0}</b></span>
            <span class="chip">WINS <b>${h.wins ?? 0}</b></span>
            <span class="chip">TOKENS <b>${formatTokens(h.total_tokens)}</b></span>
            <span class="chip">AVG FIN <b>${avgFinish(h.total_finishing_position, h.races_entered)}</b></span>
            <span class="chip">XP <b>${h.xp ?? 0}</b></span>
          </div>
          ${del}
        </div>
        <div class="hats-toggle" data-action="toggle-hats" data-uid="${esc(uid)}" data-hid="${esc(h.stable_horse_id)}">🎩 Hats (${count}) ${open ? '▾' : '▸'}</div>
        ${panel}
      </div>`;
  }

  function jockeyEditHtml(usr: AdminUser): string {
    const key = `user:${usr.user_id}`;
    if (editMode && editing === key) {
      return `<span class="editable"><input class="inline-input" data-edit-input value="${esc(usr.display_name)}"><button class="mini save" data-action="save-user-name" data-uid="${esc(usr.user_id)}">save</button><button class="mini cancel" data-action="cancel-edit">cancel</button></span>`;
    }
    const pencil = editMode ? `<span class="pencil" data-action="edit-user-name" data-uid="${esc(usr.user_id)}">✎ edit</span>` : '';
    return `<span class="editable"><span class="val">${esc(usr.display_name)}</span>${pencil}</span>`;
  }

  function detailHtml(usr: AdminUser): string {
    const jockey = editMode ? `<div class="jockey-edit"><span class="lbl">Jockey name</span>${jockeyEditHtml(usr)}</div>` : '';
    const horses = usr.horses.length ? usr.horses.map((h) => horseCardHtml(h, usr.user_id)).join('') : `<span class="muted">No horses.</span>`;
    return `<tr class="detail-row"><td class="horses-cell" colspan="8"><div class="detail">${jockey}<div class="horses">${horses}</div></div></td></tr>`;
  }

  function userRowHtml(usr: AdminUser): string {
    const open = expandedUsers.has(usr.user_id);
    const wins = usr.horses.reduce((s, h) => s + (h.wins ?? 0), 0);
    const races = usr.horses.reduce((s, h) => s + (h.races_entered ?? 0), 0);
    const podiums = usr.horses.reduce((s, h) => s + (h.podiums ?? 0), 0);
    const xp = usr.horses.reduce((s, h) => s + (h.xp ?? 0), 0);
    const main = `<tr class="user-row" data-action="toggle-user" data-uid="${esc(usr.user_id)}"><td><span class="caret">${open ? '▾' : '▸'}</span></td><td>${esc(usr.display_name)}</td><td>${usr.horses.length}</td><td>${races}</td><td class="win">${wins}</td><td>${podiums}</td><td>${xp.toLocaleString()}</td><td class="muted">${esc(usr.created_at.slice(0, 10))}</td></tr>`;
    return open ? main + detailHtml(usr) : main;
  }

  function render(): void {
    container.innerHTML = `<table><thead><tr><th style="width:34px"></th><th>Jockey</th><th>Horses</th><th>Races</th><th>Wins</th><th>Podiums</th><th>XP</th><th>Joined</th></tr></thead><tbody>${data.map(userRowHtml).join('')}</tbody></table>`;
  }

  function readInput(): string {
    return container.querySelector<HTMLInputElement>('[data-edit-input]')?.value.trim() ?? '';
  }

  function onError(e: unknown): void {
    if (e && typeof e === 'object' && (e as { status?: number }).status === 401) { opts.onUnauthorized(); return; }
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Action failed';
    window.alert(msg);
  }

  container.addEventListener('click', async (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    const { action } = el.dataset;
    const uid = el.dataset.uid ?? '';
    const hid = el.dataset.hid ?? '';

    if (action === 'toggle-user') {
      expandedUsers.has(uid) ? expandedUsers.delete(uid) : expandedUsers.add(uid);
      render(); return;
    }
    if (action === 'toggle-hats') {
      const k = hatKey(uid, hid);
      expandedHats.has(k) ? expandedHats.delete(k) : expandedHats.add(k);
      render(); return;
    }
    if (action === 'edit-user-name') { editing = `user:${uid}`; render(); return; }
    if (action === 'edit-horse-name') { editing = `horse:${hatKey(uid, hid)}`; render(); return; }
    if (action === 'cancel-edit') { editing = null; render(); return; }

    if (action === 'save-user-name') {
      if (busy) return;
      const name = readInput();
      busy = true;
      try {
        const res = await opts.mutations.renameUser(uid, name);
        const usr = findUser(uid); if (usr) usr.display_name = res.display_name;
        editing = null; render();
      } catch (e) { onError(e); } finally { busy = false; }
      return;
    }
    if (action === 'save-horse-name') {
      if (busy) return;
      const name = readInput();
      busy = true;
      try {
        const updated = await opts.mutations.renameHorse(uid, hid, name);
        const h = findHorse(uid, hid); if (h) Object.assign(h, updated);
        editing = null; render();
      } catch (e) { onError(e); } finally { busy = false; }
      return;
    }
    if (action === 'remove-hat') {
      if (busy) return;
      const index = Number(el.dataset.index);
      if (!confirmFn('Remove this hat permanently?')) return;
      busy = true;
      try {
        const updated = await opts.mutations.removeHat(uid, hid, index);
        const h = findHorse(uid, hid); if (h) Object.assign(h, updated);
        render();
      } catch (e) { onError(e); } finally { busy = false; }
      return;
    }
    if (action === 'delete-horse') {
      if (busy) return;
      if (!confirmFn('Delete this horse permanently?')) return;
      busy = true;
      try {
        await opts.mutations.deleteHorse(uid, hid);
        const usr = findUser(uid); if (usr) usr.horses = usr.horses.filter((h) => h.stable_horse_id !== hid);
        expandedHats.delete(hatKey(uid, hid));
        render();
      } catch (e) { onError(e); } finally { busy = false; }
      return;
    }
  });

  render();
  return {
    setEditMode(on: boolean) { editMode = on; if (!on) editing = null; render(); },
  };
}
