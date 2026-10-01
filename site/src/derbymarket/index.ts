import type { HorseColors, OrganisationSummary } from '@token-derby/shared';
import { scoredOf } from '@token-derby/shared';
import * as api from './api.js';
import { ApiError } from './api.js';
import { getSession, getShowNotJoined, setShowNotJoined, setUid, clearSession, readCodeFromHash } from './session.js';
import { renderLogin } from './render/login.js';
import {
  renderBoard, renderNoLiveRace, renderMarketNotOpen, renderNoMarketData, renderLoadError,
  type BoardData, type OpenRow,
} from './render/board.js';
import { renderPriceChart } from './render/chart.js';
import { fetchRace, fetchOrgRaces } from '../api.js';
import { pickLiveOrLastRace } from '../render/org-live.js';

const POLL_INTERVAL_MS = 30_000;

export function renderDerbyMarket(root: HTMLElement): () => void {
  let disposed = false;
  let innerDispose: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Polling pauses while a detail chart is open — a 30s board refresh mid-hover
  // would yank the chart out from under the racer's cursor.
  let detailOpen = false;

  const clearInner = () => { innerDispose?.(); innerDispose = null; };
  const showLogin = () => { if (disposed) return; clearInner(); renderLogin(root); };

  const loadAndRender = async (orgName: string): Promise<void> => {
    let races;
    try { ({ races } = await fetchOrgRaces(orgName)); }
    catch { clearInner(); renderLoadError(root); return; }
    if (disposed) return;

    const pick = pickLiveOrLastRace(races);
    if (!pick || pick.status === 'pending') { clearInner(); renderNoLiveRace(root); return; }

    let race;
    try { race = await fetchRace(pick.join_code); }
    catch { clearInner(); renderLoadError(root); return; }
    if (disposed) return;

    // Scored, not raw current_tokens — the price beside it is priced on
    // scored tokens too (see api/src/lib/price-race.ts), so the two must agree.
    const horses = race.horses.map((h) => ({
      horse_id: h.horse_id, name: h.name, colors: h.colors, division: h.division,
      jockey: h.user_name, banked: scoredOf(h), rank: h.rank,
    }));

    const withNotJoined = (snap: { not_joined?: Array<{ horse_id: string; name: string; colors: HorseColors; division?: number }> }) => [
      ...horses,
      ...(snap.not_joined ?? []).map((r) => ({ ...r, joined: false, banked: 0 })),
    ];

    // Opens a market row's detail chart in place of the board; `showBoard`
    // (set by whichever branch below renders the board) puts it back.
    let showBoard: (() => void) | null = null;
    const openDetail = async (row: OpenRow): Promise<void> => {
      let historyRes;
      try { historyRes = await api.getMarketHistory(pick.join_code); }
      catch { clearInner(); renderLoadError(root); return; }
      if (disposed) return;
      const history = historyRes.history;
      detailOpen = true;
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

    if (race.status === 'live') {
      let marketsRes;
      try { marketsRes = await api.getMarkets(pick.join_code); }
      catch { clearInner(); renderLoadError(root); return; }
      if (disposed) return;

      clearInner();
      if (!marketsRes.open) {
        innerDispose = renderMarketNotOpen(root, {
          raceName: race.name, opensInSeconds: marketsRes.opens_in_seconds ?? 0,
        });
        return;
      }
      const data: BoardData = {
        raceName: race.name, runnerCount: horses.length, timeLeftSeconds: race.time_left_seconds,
        finished: false, divisionNames: race.league_division_names,
        horses: withNotJoined(marketsRes.snapshot),
        prices: marketsRes.snapshot.prices,
        showNotJoined: getShowNotJoined(),
        onToggleNotJoined: (show) => { setShowNotJoined(show); data.showNotJoined = show; showBoard?.(); },
      };
      showBoard = () => {
        data.showNotJoined = getShowNotJoined();
        clearInner(); innerDispose = renderBoard(root, data, (row) => void openDetail(row));
      };
      showBoard();
      return;
    }

    if (race.status === 'finished') {
      let historyRes;
      try { historyRes = await api.getMarketHistory(pick.join_code); }
      catch { clearInner(); renderLoadError(root); return; }
      if (disposed) return;

      clearInner();
      const last = historyRes.history[historyRes.history.length - 1];
      if (!last) { renderNoMarketData(root, { raceName: race.name }); return; }
      const data: BoardData = {
        raceName: race.name, runnerCount: horses.length, timeLeftSeconds: null,
        finished: true, divisionNames: race.league_division_names,
        horses: withNotJoined(last),
        prices: last.prices,
        showNotJoined: getShowNotJoined(),
        onToggleNotJoined: (show) => { setShowNotJoined(show); data.showNotJoined = show; showBoard?.(); },
      };
      showBoard = () => {
        data.showNotJoined = getShowNotJoined();
        clearInner(); innerDispose = renderBoard(root, data, (row) => void openDetail(row));
      };
      showBoard();
      return;
    }

    // Defensive: any other status behaves like "nothing to show yet".
    clearInner();
    renderNoLiveRace(root);
  };

  const pollTick = async (orgName: string): Promise<void> => {
    if (disposed) return;
    if (!detailOpen) await loadAndRender(orgName);
    if (!disposed) timer = setTimeout(() => void pollTick(orgName), POLL_INTERVAL_MS);
  };

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

    // 2. Resolve the user's organisation, then start polling its races.
    let orgs: OrganisationSummary[];
    try { ({ organisations: orgs } = await api.listOrganisations()); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) clearSession();
      showLogin();
      return;
    }
    if (disposed) return;

    const orgName = orgs[0]?.org_name;
    if (!orgName) { renderNoLiveRace(root); return; }

    void pollTick(orgName);
  };

  void boot();
  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    clearInner();
  };
}
