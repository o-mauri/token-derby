import { useEffect, useState } from 'react';
import type { Config, EnvName } from '../../electron/config.js';
import { api, DesktopApiError } from '../api.js';
import { errorMessage } from '../lib/errors.js';

function messageFor(err: unknown): string {
  return errorMessage(err instanceof DesktopApiError ? err.code : 'UNKNOWN');
}

// Settings sub-screen behind the popover shell's gear icon (see App.tsx).
// Everyday controls up top; the Advanced accordion below gates the
// power-user overrides (env, api base, home folder) that can break sign-in
// if set wrong, so it stays collapsed by default.
//
// `onIdentityChange` lets the shell's header (name/horse-count, rendered
// above this screen and never remounted — see App.tsx's refreshHeader) stay
// in sync whenever something here changes who's signed in or what they're
// called: a display-name edit, an environment switch (different identity
// per env), or a sign-out.
export default function Settings({
  onBack,
  onIdentityChange,
}: {
  onBack: () => void;
  onIdentityChange?: () => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const [copyBusy, setCopyBusy] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [envBusy, setEnvBusy] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);

  const [apiBaseInput, setApiBaseInput] = useState('');
  const [apiBaseBusy, setApiBaseBusy] = useState(false);
  const [apiBaseError, setApiBaseError] = useState<string | null>(null);

  const [homeInput, setHomeInput] = useState('');
  const [homeBusy, setHomeBusy] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  function load() {
    setLoadError(null);
    api.getBootstrap().then(
      (bootstrap) => {
        setConfig(bootstrap.config);
        setAppVersion(bootstrap.appVersion);
        setApiBaseInput(bootstrap.config.apiBaseOverride ?? '');
        setHomeInput(bootstrap.config.homeOverride ?? '');
        setDisplayName(bootstrap.identity?.display_name ?? '');
        setNameInput(bootstrap.identity?.display_name ?? '');
      },
      (err) => setLoadError(messageFor(err)),
    );
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('Name cannot be empty.');
      return;
    }
    setNameBusy(true);
    setNameError(null);
    try {
      const result = await api.updateJockey(trimmed);
      setDisplayName(result.display_name);
      setNameInput(result.display_name);
      setEditingName(false);
      onIdentityChange?.();
    } catch (err) {
      setNameError(messageFor(err));
    } finally {
      setNameBusy(false);
    }
  }

  async function handleToggleLogin() {
    if (!config) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      setConfig(await api.setConfig({ launchAtLogin: !config.launchAtLogin }));
    } catch (err) {
      setLoginError(messageFor(err));
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleCheckForUpdate() {
    setCheckingUpdate(true);
    setUpdateMessage(null);
    try {
      const result = await api.checkForUpdate();
      setUpdateMessage(result.updateAvailable ? 'A new version is available.' : "You're up to date.");
    } catch (err) {
      setUpdateMessage(messageFor(err));
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleCopyIdentity() {
    setCopyBusy(true);
    setCopyError(null);
    setCopyMessage(null);
    try {
      const { token } = await api.exportIdentity();
      await navigator.clipboard.writeText(token);
      setCopyMessage('Copied to clipboard.');
    } catch (err) {
      setCopyError(messageFor(err));
    } finally {
      setCopyBusy(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      // main.ts hides the popover and opens onboarding once this call
      // resolves ok. onIdentityChange clears the shell header immediately
      // (rather than leaving the previous user's name/count showing for the
      // moment before the popover hides), and the window-focus listener in
      // App.tsx picks up the eventual new identity once onboarding completes
      // and the popover is shown again.
      await api.signOut();
      onIdentityChange?.();
    } catch (err) {
      setSignOutError(messageFor(err));
      setSigningOut(false);
    }
  }

  function handleQuit() {
    api.quitApp().catch(() => {
      // Non-fatal: worst case the button does nothing and the user retries.
    });
  }

  async function handleEnvChange(env: EnvName) {
    if (!config || config.env === env || envBusy) return;
    setEnvBusy(true);
    setEnvError(null);
    try {
      await api.setConfig({ env });
      // Identity, display name, and api base are all per-environment —
      // reload everything rather than patching state piecemeal, and tell
      // the shell header (a different identity now, or none at all).
      load();
      onIdentityChange?.();
    } catch (err) {
      setEnvError(messageFor(err));
    } finally {
      setEnvBusy(false);
    }
  }

  async function handleApiBaseBlur() {
    if (!config) return;
    const value = apiBaseInput.trim() || null;
    if (value === config.apiBaseOverride) return;
    setApiBaseBusy(true);
    setApiBaseError(null);
    try {
      setConfig(await api.setConfig({ apiBaseOverride: value }));
    } catch (err) {
      setApiBaseError(messageFor(err));
    } finally {
      setApiBaseBusy(false);
    }
  }

  async function handleChooseHome() {
    setHomeBusy(true);
    setHomeError(null);
    try {
      const { path } = await api.chooseFolder();
      if (path) {
        setConfig(await api.setConfig({ homeOverride: path }));
        setHomeInput(path);
      }
    } catch (err) {
      setHomeError(messageFor(err));
    } finally {
      setHomeBusy(false);
    }
  }

  async function handleResetHome() {
    setHomeBusy(true);
    setHomeError(null);
    try {
      setConfig(await api.setConfig({ homeOverride: null }));
      setHomeInput('');
    } catch (err) {
      setHomeError(messageFor(err));
    } finally {
      setHomeBusy(false);
    }
  }

  return (
    <div className="settings-panel">
      <button className="popover-settings-back" type="button" onClick={onBack}>
        ‹ Back
      </button>

      {loadError && <p className="race-empty-message">{loadError}</p>}

      <section className="settings-section">
        <span className="settings-label">Display name</span>
        {editingName ? (
          <form className="settings-inline-form" onSubmit={handleSaveName}>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={80}
            />
            <button type="submit" className="onboarding-button settings-small-button" disabled={nameBusy}>
              {nameBusy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="onboarding-button-link"
              onClick={() => {
                setEditingName(false);
                setNameInput(displayName);
                setNameError(null);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="settings-row">
            <span className="settings-value">{displayName || '—'}</span>
            <button type="button" className="onboarding-button-link" onClick={() => setEditingName(true)}>
              Edit
            </button>
          </div>
        )}
        {nameError && <p className="onboarding-error">{nameError}</p>}
      </section>

      <section className="settings-section settings-row">
        <span className="settings-label">Launch at login</span>
        <button
          type="button"
          role="switch"
          aria-checked={config?.launchAtLogin ?? false}
          className={'settings-toggle' + (config?.launchAtLogin ? ' settings-toggle-on' : '')}
          onClick={handleToggleLogin}
          disabled={!config || loginBusy}
        >
          <span className="settings-toggle-knob" />
        </button>
      </section>
      {loginError && <p className="onboarding-error">{loginError}</p>}

      <section className="settings-section settings-row">
        <span className="settings-label">Version</span>
        <span className="settings-value">{appVersion ? `v${appVersion}` : '—'}</span>
      </section>
      <section className="settings-section">
        <div className="settings-row">
          <button
            type="button"
            className="onboarding-button-secondary settings-small-button"
            onClick={handleCheckForUpdate}
            disabled={checkingUpdate}
          >
            {checkingUpdate ? 'Checking…' : 'Check for updates'}
          </button>
          {updateMessage && <span className="settings-hint">{updateMessage}</span>}
        </div>
      </section>

      <section className="settings-section">
        <span className="settings-label">Identity</span>
        <div className="settings-row">
          <button
            type="button"
            className="onboarding-button-secondary settings-small-button"
            onClick={handleCopyIdentity}
            disabled={copyBusy}
          >
            {copyBusy ? 'Copying…' : 'Copy identity'}
          </button>
          <button
            type="button"
            className="onboarding-button-secondary settings-small-button settings-signout-button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        {copyMessage && <p className="editor-message">{copyMessage}</p>}
        {copyError && <p className="onboarding-error">{copyError}</p>}
        {signOutError && <p className="onboarding-error">{signOutError}</p>}
      </section>

      <section className="settings-section settings-row">
        <button type="button" className="onboarding-button-secondary settings-small-button" onClick={handleQuit}>
          Quit Token Derby
        </button>
        <span className="settings-hint">⌘Q</span>
      </section>

      <Accordion open={advancedOpen} onToggle={() => setAdvancedOpen((o) => !o)}>
        <p className="settings-caption">
          Power-user overrides — wrong values here can break sign-in. Reset if anything looks off.
        </p>

        <div className="settings-section">
          <span className="settings-label">Environment</span>
          <div className="settings-segmented">
            <button
              type="button"
              className={'settings-segment' + (config?.env === 'prod' ? ' settings-segment-active' : '')}
              onClick={() => handleEnvChange('prod')}
              disabled={envBusy}
            >
              Prod
            </button>
            <button
              type="button"
              className={'settings-segment' + (config?.env === 'staging' ? ' settings-segment-active' : '')}
              onClick={() => handleEnvChange('staging')}
              disabled={envBusy}
            >
              Staging
            </button>
          </div>
          {envError && <p className="onboarding-error">{envError}</p>}
        </div>

        <label className="onboarding-field settings-section">
          <span>API base URL override</span>
          <input
            value={apiBaseInput}
            onChange={(e) => setApiBaseInput(e.target.value)}
            onBlur={handleApiBaseBlur}
            placeholder="Blank = environment default"
            disabled={apiBaseBusy}
          />
          {apiBaseError && <p className="onboarding-error">{apiBaseError}</p>}
        </label>

        <div className="onboarding-field settings-section">
          <span>Home folder override</span>
          <input value={homeInput} readOnly placeholder="Default app data folder" />
          <div className="settings-row">
            <button
              type="button"
              className="onboarding-button-secondary settings-small-button"
              onClick={handleChooseHome}
              disabled={homeBusy}
            >
              {homeBusy ? 'Working…' : 'Choose…'}
            </button>
            <button
              type="button"
              className="onboarding-button-link"
              onClick={handleResetHome}
              disabled={homeBusy || !config?.homeOverride}
            >
              Reset
            </button>
          </div>
          {homeError && <p className="onboarding-error">{homeError}</p>}
        </div>
      </Accordion>
    </div>
  );
}

function Accordion({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-advanced">
      <button
        type="button"
        className="settings-advanced-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>Advanced</span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="settings-advanced-body">{children}</div>}
    </section>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
