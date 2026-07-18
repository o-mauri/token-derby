import { useEffect, useState } from 'react';
import { api, DesktopApiError } from '../api.js';
import { errorMessage } from '../lib/errors.js';
import { validateDisplayName, buildPasteToken } from './onboarding-logic.js';

// First-run onboarding: create a new jockey, or import an identity the CLI
// already has on this machine (with a paste-token fallback when it doesn't).
// Success is signalled purely by calling window.api — main.ts owns closing
// this window and revealing the popover once the identity IPC call succeeds.

type Step = 'choose' | 'new-jockey' | 'import-cli' | 'paste-fallback' | 'success';

export default function Onboarding() {
  const [step, setStep] = useState<Step>('choose');
  const [env, setEnv] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [secretToken, setSecretToken] = useState('');

  useEffect(() => {
    api.getBootstrap().then(
      (bootstrap) => setEnv(bootstrap.config.env),
      () => {},
    );
  }, []);

  async function handleCreateJockey(e: React.FormEvent) {
    e.preventDefault();
    const validated = validateDisplayName(name);
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.initJockey(validated.name);
      setStep('success');
    } catch (err) {
      setError(err instanceof DesktopApiError ? errorMessage(err.code) : errorMessage('UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFromCli() {
    setBusy(true);
    setError(null);
    try {
      await api.importCliIdentity();
      setStep('success');
    } catch {
      setError(null);
      setStep('paste-fallback');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasteIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim() || !secretToken.trim()) {
      setError('Enter both your User ID and Secret token.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.pasteIdentity(buildPasteToken(userId, secretToken));
      setStep('success');
    } catch (err) {
      setError(err instanceof DesktopApiError ? errorMessage(err.code) : errorMessage('UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-logo" aria-hidden="true">
        <span className="onboarding-logo-pixel" />
        <span className="onboarding-logo-pixel" />
        <span className="onboarding-logo-pixel" />
      </div>
      <h1 className="onboarding-title">Token Derby</h1>
      <p className="onboarding-tagline">Saddle up your stable.</p>

      {step === 'choose' && (
        <div className="onboarding-panel">
          <button className="onboarding-button" onClick={() => setStep('new-jockey')}>
            Create a new jockey
          </button>
          <button className="onboarding-button onboarding-button-secondary" onClick={handleImportFromCli} disabled={busy}>
            {busy ? 'Importing…' : 'Import from CLI'}
          </button>
        </div>
      )}

      {step === 'new-jockey' && (
        <form className="onboarding-panel" onSubmit={handleCreateJockey}>
          <label className="onboarding-field">
            <span>Jockey name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
              maxLength={80}
            />
          </label>
          {error && <p className="onboarding-error">{error}</p>}
          <button className="onboarding-button" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create jockey'}
          </button>
          <button
            className="onboarding-button onboarding-button-link"
            type="button"
            onClick={() => {
              setError(null);
              setStep('choose');
            }}
          >
            Back
          </button>
        </form>
      )}

      {step === 'paste-fallback' && (
        <form className="onboarding-panel" onSubmit={handlePasteIdentity}>
          <p className="onboarding-hint">
            Couldn't find a CLI identity on this machine. Paste yours from{' '}
            <code>~/.token-derby{env === 'staging' ? '-staging' : ''}/identity.json</code> instead.
          </p>
          <label className="onboarding-field">
            <span>User ID</span>
            <input autoFocus value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_id" />
          </label>
          <label className="onboarding-field">
            <span>Secret token</span>
            <input
              type="password"
              value={secretToken}
              onChange={(e) => setSecretToken(e.target.value)}
              placeholder="secret_token"
            />
          </label>
          {error && <p className="onboarding-error">{error}</p>}
          <button className="onboarding-button" type="submit" disabled={busy}>
            {busy ? 'Connecting…' : 'Continue'}
          </button>
          <button
            className="onboarding-button onboarding-button-link"
            type="button"
            onClick={() => {
              setError(null);
              setStep('choose');
            }}
          >
            Back
          </button>
        </form>
      )}

      {step === 'success' && (
        <div className="onboarding-panel">
          <p className="onboarding-hint">You're in. Opening Token Derby…</p>
        </div>
      )}

      {env && <p className="onboarding-env">Connected to {env}</p>}
    </div>
  );
}
