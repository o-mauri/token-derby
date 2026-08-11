import { useEffect, useState } from 'react';
import { api } from './api.js';
import Race from './screens/Race.js';
import Stable from './screens/Stable.js';
import Org from './screens/Org.js';
import League from './screens/League.js';
import Settings from './screens/Settings.js';

type Tab = 'race' | 'stable' | 'org' | 'league' | 'settings';

// Popover shell: header (identity + gear→settings) and the Race/Stable/Org
// tab bar, all driven by local route state — this is a single fixed-size
// BrowserWindow (see electron/windows.ts), never a real router.
export default function App() {
  const [tab, setTab] = useState<Tab>('race');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [horseCount, setHorseCount] = useState<number | null>(null);
  // Org whose league the League tab shows, or null when the jockey has none —
  // which is also what hides the tab.
  const [leagueOrgName, setLeagueOrgName] = useState<string | null>(null);

  // The popover is one long-lived BrowserWindow that's only ever show()/
  // hide()'d (see electron/windows.ts) — this component never remounts, so
  // a mount-only fetch would leave the header stuck on stale identity/
  // horse-count after anything in Settings changes who's signed in (env
  // switch, sign-out→re-onboard). refreshHeader() is re-run explicitly by
  // those flows below, plus on window focus as a catch-all for whenever the
  // popover is shown again (e.g. after onboarding closes and main.ts calls
  // popover.show()/focus()).
  function refreshHeader() {
    api.getBootstrap().then(
      (bootstrap) => setDisplayName(bootstrap.identity?.display_name ?? null),
      () => setDisplayName(null),
    );
    api.listStable().then(
      (stable) => setHorseCount(stable.horses.length),
      () => setHorseCount(null),
    );
    refreshLeague();
  }

  // The standings endpoint answers { standings: null } for an org with no league,
  // so one call per org both detects a league and is the data the tab needs.
  // Probed in parallel; the first org in list order that has one wins. Re-run
  // alongside the header so a league created while the popover is open shows up.
  function refreshLeague() {
    api.listOrganisations().then(
      async ({ organisations }) => {
        const probed = await Promise.all(
          organisations.map((o) =>
            api.getOrgLeagueStandings(o.org_name).then(
              (res) => (res.standings ? o.org_name : null),
              () => null,
            ),
          ),
        );
        setLeagueOrgName(probed.find((name) => name !== null) ?? null);
      },
      () => setLeagueOrgName(null),
    );
  }

  useEffect(() => {
    refreshHeader();
  }, []);

  useEffect(() => {
    window.addEventListener('focus', refreshHeader);
    return () => window.removeEventListener('focus', refreshHeader);
  }, []);

  // The tab can vanish under the user (league deleted, or they left the org), which
  // would otherwise leave the popover on a tab with nothing to render.
  useEffect(() => {
    if (tab === 'league' && !leagueOrgName) setTab('race');
  }, [tab, leagueOrgName]);

  // The popover has no application menu (it's an accessory/tray-only app —
  // see main.ts's app.dock.hide()), so Cmd+Q needs its own handler here
  // rather than relying on Electron's default menu shortcut.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        api.quitApp().catch(() => {});
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const initial = (displayName ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="popover">
      <header className="popover-header">
        <div className="popover-avatar" aria-hidden="true">
          {initial}
        </div>
        <div className="popover-identity">
          <span className="popover-name">{displayName ?? 'Loading…'}</span>
          <span className="popover-horse-count">
            {horseCount === null ? '' : `${horseCount} horse${horseCount === 1 ? '' : 's'}`}
          </span>
        </div>
        <button
          className="popover-gear"
          type="button"
          aria-label="Settings"
          onClick={() => setTab('settings')}
        >
          <GearIcon />
        </button>
      </header>

      {tab !== 'settings' && (
        <nav className="popover-tabs">
          <TabButton label="Race" active={tab === 'race'} onClick={() => setTab('race')} />
          <TabButton label="Stable" active={tab === 'stable'} onClick={() => setTab('stable')} />
          <TabButton label="Org" active={tab === 'org'} onClick={() => setTab('org')} />
          {leagueOrgName && (
            <TabButton label="League" active={tab === 'league'} onClick={() => setTab('league')} />
          )}
        </nav>
      )}

      <main className="popover-body">
        {tab === 'race' && <Race />}
        {tab === 'stable' && <Stable />}
        {tab === 'org' && <Org />}
        {tab === 'league' && leagueOrgName && <League orgName={leagueOrgName} />}
        {tab === 'settings' && (
          <Settings
            onBack={() => {
              refreshHeader();
              setTab('race');
            }}
            onIdentityChange={refreshHeader}
          />
        )}
      </main>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={active ? 'popover-tab popover-tab-active' : 'popover-tab'}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M8 1.5v1.4M8 13.1v1.4M14.5 8h-1.4M2.9 8H1.5M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
