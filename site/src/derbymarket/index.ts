import type { HorseColors, RaceSummary } from '@token-derby/shared';
import { scoredOf, MARKET_OPEN_MIN } from '@token-derby/shared';
import * as api from './api.js';
import { ApiError } from './api.js';
import { getSession, getShowNotJoined, setShowNotJoined, setUid, clearSession, readCodeFromHash } from './session.js';
import {
  renderBoard, renderMarketNotOpen, renderNoMarketData, renderLoadError, type BoardData, type OpenRow,
} from './render/board.js';
import { renderPriceChart } from './render/chart.js';
import {
  nextPendingRace, renderPickerSignedIn, renderPickerSignedOut, renderNoRaces, renderMarketNotFound, type PickerEntry,
} from './render/picker.js';
import { createLoader } from '../render/loader.js';
import { fetchRace, fetchOrgRaces, ApiError as SiteApiError } from '../api.js';
import { marketHref } from '../market/host.js';
import type { MarketRoute } from '../route.js';

const POLL_INTERVAL_MS = 30_000;

export type MarketDeps = {
  navigate?: (path: string) => void;
  forward?: (path: string) => void;
  replacePath?: (path: string) => void;
  hostname?: string;
};

export function renderMarket(root: HTMLElement, route: MarketRoute, deps: MarketDeps = {}): () => void {
  const hostname = deps.hostname ?? window.location.hostname;
  const href = (path: string) => marketHref(path, hostname);
  const navigate = deps.navigate ?? ((path: string) => window.location.assign(href(path)));
  const forward = deps.forward ?? ((path: string) => window.location.replace(href(path)));
  const replacePath = deps.replacePath ?? ((path: string) => history.replaceState(null, '', href(path)));

  let disposed = false;
  let stopped = false;
  let moved = false;
  let innerDispose: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Polling pauses while a chart is open, so a refresh can't pull it away mid-hover.
  let detailOpen = false;
  // Once a board is up, a failed refresh leaves it in place.
  let boardShown = false;
  const loadFailed = () => { if (boardShown) return; clearInner(); renderLoadError(root); };

  const clearInner = () => { innerDispose?.(); innerDispose = null; };
  const showLoader = () => { clearInner(); root.replaceChildren(createLoader(root.ownerDocument)); };
  const stopPolling = () => { if (timer) clearTimeout(timer); timer = null; stopped = true; };
  const gone = () => disposed || stopped;
  // A poll that was in flight when a chart opened must not draw over it.
  const stale = () => gone() || detailOpen;

  // Which org and race this board shows, resolved once and reused by every poll.
  let orgKey = route.type === 'org' || route.type === 'race' ? route.orgName : '';
  let orgName = orgKey;
  let joinCode = route.type === 'race' ? route.joinCode : null;

  const loadBoard = async (): Promise<void> => {
    let races: RaceSummary[];
    try {
      ({ org_name: orgName, races } = await fetchOrgRaces(orgKey));
    } catch (e) {
      if (stale()) return;
      if (e instanceof SiteApiError && e.status === 404) {
        clearInner();
        if (joinCode) { await moveRaceToItsOrg(); return; }
        renderMarketNotFound(root, { org: orgName }, href);
        stopPolling();
        return;
      }
      loadFailed();
      return;
    }
    if (stale()) return;

    if (joinCode && !races.some((r) => r.join_code === joinCode)) { await moveRaceToItsOrg(); return; }
    const next = nextPendingRace(races, Date.now());
    const pick = joinCode
      ? races.find((r) => r.join_code === joinCode)!
      : races.find((r) => r.status === 'live') ?? latestFinished(races);
    if (!pick) { clearInner(); renderNoRaces(root, orgName, next); return; }

    let race;
    try { race = await fetchRace(pick.join_code); }
    catch { if (!stale()) loadFailed(); return; }
    if (stale()) return;

    // Scored, not raw: the prices beside them are priced on scored tokens too.
    const horses = race.horses.map((h) => ({
      horse_id: h.horse_id, name: h.name, colors: h.colors, division: h.division,
      jockey: h.user_name, banked: scoredOf(h), rank: h.rank,
    }));
    const withNotJoined = (snap: { not_joined?: Array<{ horse_id: string; name: string; colors: HorseColors; division?: number }> }) => [
      ...horses, ...(snap.not_joined ?? []).map((r) => ({ ...r, joined: false, banked: 0 })),
    ];

    let showBoard: (() => void) | null = null;
    const openDetail = async (row: OpenRow): Promise<void> => {
      detailOpen = true;
      showLoader();
      let history;
      try { ({ history } = await api.getMarketHistory(pick.join_code)); }
      catch { detailOpen = false; if (!gone()) { clearInner(); renderLoadError(root); } return; }
      if (gone()) return;
      const showChart = (): void => {
        clearInner();
        innerDispose = renderPriceChart(root, {
          history, runners: row.runners, market: row.market, name: row.name,
          meta: row.meta, sectionHeading: row.heading, divisionNames: race.league_division_names,
          showNotJoined: getShowNotJoined(),
          onToggleNotJoined: (show) => { setShowNotJoined(show); showChart(); },
          onBack: () => { detailOpen = false; showBoard?.(); },
        });
      };
      showChart();
    };

    const show = (data: BoardData) => {
      boardShown = true;
      showBoard = () => {
        data.showNotJoined = getShowNotJoined();
        clearInner();
        innerDispose = renderBoard(root, data, (row) => void openDetail(row));
      };
      showBoard();
    };
    const common = {
      orgName, raceName: race.name, runnerCount: horses.length, divisionNames: race.league_division_names,
      showNotJoined: getShowNotJoined(),
    };
    const onToggleNotJoined = (data: BoardData) => (s: boolean) => { setShowNotJoined(s); data.showNotJoined = s; showBoard?.(); };

    if (race.status === 'live') {
      let markets;
      try { markets = await api.getMarkets(pick.join_code); }
      catch { if (!stale()) loadFailed(); return; }
      if (stale()) return;
      if (!markets.open) {
        clearInner();
        innerDispose = renderMarketNotOpen(root, { raceName: race.name, opensInSeconds: markets.opens_in_seconds ?? 0 });
        return;
      }
      const data: BoardData = {
        ...common, timeLeftSeconds: race.time_left_seconds, finished: false,
        horses: withNotJoined(markets.snapshot), prices: markets.snapshot.prices,
      };
      data.onToggleNotJoined = onToggleNotJoined(data);
      show(data);
      return;
    }

    if (race.status === 'finished') {
      let history;
      try { ({ history } = await api.getMarketHistory(pick.join_code)); }
      catch { if (!stale()) loadFailed(); return; }
      if (stale()) return;
      const last = history[history.length - 1];
      clearInner();
      if (!last) { renderNoMarketData(root, { raceName: race.name }); return; }
      const data: BoardData = {
        ...common, timeLeftSeconds: null, finished: true, nextRace: next ? { name: next.name, startsAt: next.start_time } : null,
        horses: withNotJoined(last), prices: last.prices,
      };
      data.onToggleNotJoined = onToggleNotJoined(data);
      show(data);
      return;
    }

    clearInner();
    innerDispose = renderMarketNotOpen(root, {
      raceName: race.name,
      opensInSeconds: Math.max(0, Math.round((Date.parse(race.start_time) + MARKET_OPEN_MIN * 60_000 - Date.now()) / 1000)),
    });
  };

  // A join code under the wrong org: follow the race to the org it belongs to.
  const moveRaceToItsOrg = async (): Promise<void> => {
    const notFound = () => { clearInner(); renderMarketNotFound(root, { race: joinCode! }, href); stopPolling(); };
    if (moved) { notFound(); return; }
    let race;
    try { race = await fetchRace(joinCode!); }
    catch (e) {
      if (stale()) return;
      if (e instanceof SiteApiError && e.status === 404) { notFound(); return; }
      clearInner();
      renderLoadError(root);
      return;
    }
    if (stale()) return;
    if (!race.organisation_name) { notFound(); return; }
    moved = true;
    orgKey = race.organisation_name;
    orgName = orgKey;
    replacePath(`/${encodeURIComponent(orgName)}/${joinCode}`);
    await loadBoard();
  };

  const poll = async (): Promise<void> => {
    if (gone()) return;
    if (!detailOpen) await loadBoard();
    if (!gone()) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
  };

  const showPicker = async (): Promise<void> => {
    if (!getSession()) { renderPickerSignedOut(root, (name) => navigate(`/${encodeURIComponent(name)}`)); return; }
    showLoader();
    let orgs;
    try { ({ organisations: orgs } = await api.listOrganisations()); }
    catch (e) {
      if (disposed) return;
      if (e instanceof ApiError && e.status === 401) clearSession();
      renderPickerSignedOut(root, (name) => navigate(`/${encodeURIComponent(name)}`));
      return;
    }
    const entries: PickerEntry[] = await Promise.all(orgs.map(async (o) => {
      try {
        const { races } = await fetchOrgRaces(o.org_name);
        return { org_name: o.org_name, live: races.find((r) => r.status === 'live') ?? null, next: nextPendingRace(races, Date.now()) };
      } catch {
        return { org_name: o.org_name, live: null, next: null };
      }
    }));
    if (disposed) return;
    const liveOrgs = entries.filter((e) => e.live);
    if (liveOrgs.length === 1) { forward(`/${encodeURIComponent(liveOrgs[0]!.org_name)}`); return; }
    renderPickerSignedIn(root, entries, href);
  };

  const boot = async (): Promise<void> => {
    const code = readCodeFromHash();
    if (code) {
      try { setUid((await api.exchangeCode(code)).user.user_id); } catch { /* the public board still works */ }
    }
    if (disposed) return;
    if (route.type === 'not-found') { renderMarketNotFound(root, null, href); return; }
    if (route.type === 'picker') { await showPicker(); return; }
    showLoader();
    await poll();
  };

  void boot();
  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    clearInner();
  };
}

function latestFinished(races: RaceSummary[]): RaceSummary | undefined {
  return races
    .filter((r) => r.status === 'finished')
    .sort((a, b) => Date.parse(b.ended_at ?? b.end_time) - Date.parse(a.ended_at ?? a.end_time))[0];
}
