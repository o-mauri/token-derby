import { useEffect, useState } from 'react';
import { api } from './api.js';
import Race from './screens/Race.js';
import Stable from './screens/Stable.js';

type Tab = 'race' | 'stable' | 'org' | 'settings';

// Popover shell: header (identity + gear→settings) and the Race/Stable/Org
// tab bar, all driven by local route state — this is a single fixed-size
// BrowserWindow (see electron/windows.ts), never a real router. Tasks 9-11
// fill in the Stable/Org/Settings tab content.
export default function App() {
  const [tab, setTab] = useState<Tab>('race');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [horseCount, setHorseCount] = useState<number | null>(null);

  useEffect(() => {
    api.getBootstrap().then(
      (bootstrap) => setDisplayName(bootstrap.identity?.display_name ?? null),
      () => {},
    );
    api.listStable().then(
      (stable) => setHorseCount(stable.horses.length),
      () => {},
    );
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
        </nav>
      )}

      <main className="popover-body">
        {tab === 'race' && <Race />}
        {tab === 'stable' && <Stable />}
        {tab === 'org' && <Placeholder label="Org" />}
        {tab === 'settings' && <SettingsPlaceholder onBack={() => setTab('race')} />}
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

function Placeholder({ label }: { label: string }) {
  return <p className="popover-placeholder">{label} coming soon.</p>;
}

function SettingsPlaceholder({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <button className="popover-settings-back" type="button" onClick={onBack}>
        ‹ Back
      </button>
      <p className="popover-placeholder">Settings coming soon.</p>
    </div>
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
