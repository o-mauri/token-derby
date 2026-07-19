import { useEffect, useState } from 'react';
import type { OrganisationSummary } from '@token-derby/shared';
import { api, DesktopApiError } from '../api.js';
import { errorMessage } from '../lib/errors.js';
import { mapLeaderboard, resolveOrgName, type LeaderboardRow } from './org-leaderboard.js';

function messageFor(err: unknown): string {
  return errorMessage(err instanceof DesktopApiError ? err.code : 'UNKNOWN');
}

// Org tab: org summary + top-jockeys leaderboard for whichever org is
// selected, a join-by-token flow (always available, since a jockey can be in
// more than one org), and a link out to the web org-manager via the same
// one-time createWebSession code the CLI's `token-derby web` uses.
export default function Org() {
  const [orgs, setOrgs] = useState<OrganisationSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const [orgName, setOrgName] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinToken, setJoinToken] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [webBusy, setWebBusy] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  function loadOrgs() {
    setLoadError(null);
    api.listOrganisations().then(
      (res) => {
        setOrgs(res.organisations);
        setSelectedOrgId((prev) => prev ?? res.organisations[0]?.org_id ?? null);
      },
      (err) => setLoadError(messageFor(err)),
    );
  }

  useEffect(() => {
    loadOrgs();
  }, []);

  useEffect(() => {
    // getOrgLeaderboard is keyed by org NAME, not org_id — resolve it here
    // rather than passing the id straight through (see resolveOrgName).
    const name = orgs ? resolveOrgName(orgs, selectedOrgId) : null;
    if (!name) {
      setLeaderboard(null);
      setOrgName(null);
      return;
    }
    setLeaderboard(null);
    setLeaderboardError(null);
    api.getOrgLeaderboard(name).then(
      (res) => {
        setOrgName(res.org_name);
        setLeaderboard(mapLeaderboard(res));
      },
      (err) => setLeaderboardError(messageFor(err)),
    );
  }, [orgs, selectedOrgId]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = joinToken.trim();
    if (!trimmed) return;
    setJoining(true);
    setJoinError(null);
    try {
      const joined = await api.joinOrganisation(trimmed);
      setJoinToken('');
      setShowJoinForm(false);
      const list = await api.listOrganisations();
      setOrgs(list.organisations);
      setSelectedOrgId(joined.org_id);
    } catch (err) {
      setJoinError(messageFor(err));
    } finally {
      setJoining(false);
    }
  }

  async function handleOpenOrgManager() {
    setWebBusy(true);
    setWebError(null);
    try {
      const session = await api.createWebSession();
      await api.openExternal(session.url);
    } catch (err) {
      setWebError(messageFor(err));
    } finally {
      setWebBusy(false);
    }
  }

  if (orgs === null && loadError) {
    return (
      <div className="race-empty">
        <p className="race-empty-message">{loadError}</p>
        <button type="button" className="onboarding-button-link" onClick={loadOrgs}>
          Try again
        </button>
      </div>
    );
  }

  if (orgs === null) {
    return <p className="popover-placeholder">Loading organisations…</p>;
  }

  if (orgs.length === 0) {
    return (
      <div className="org-panel">
        <p className="popover-placeholder">You're not in an organisation yet.</p>
        <JoinForm
          token={joinToken}
          onTokenChange={setJoinToken}
          onSubmit={handleJoin}
          busy={joining}
          error={joinError}
        />
      </div>
    );
  }

  return (
    <div className="org-panel">
      {orgs.length > 1 ? (
        <select
          className="org-select"
          aria-label="Organisation"
          value={selectedOrgId ?? ''}
          onChange={(e) => setSelectedOrgId(e.target.value)}
        >
          {orgs.map((org) => (
            <option key={org.org_id} value={org.org_id}>
              {org.org_name}
            </option>
          ))}
        </select>
      ) : (
        <h2 className="org-name">{orgName ?? orgs[0]?.org_name}</h2>
      )}

      {leaderboardError ? (
        <p className="race-empty-message">{leaderboardError}</p>
      ) : leaderboard === null ? (
        <p className="popover-placeholder">Loading leaderboard…</p>
      ) : leaderboard.length === 0 ? (
        <p className="popover-placeholder">No horses have raced here yet.</p>
      ) : (
        <ol className="org-leaderboard">
          {leaderboard.map((row, i) => (
            <li key={`${row.name}-${row.owner_name}`} className="org-leaderboard-row">
              <span className="org-leaderboard-rank">{i + 1}</span>
              <span className="org-leaderboard-info">
                <span className="org-leaderboard-name">{row.name}</span>
                <span className="org-leaderboard-owner">{row.owner_name}</span>
              </span>
              <span className="org-leaderboard-stats">
                {row.xp} XP · {row.wins}W · {row.podiums}P
              </span>
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className="onboarding-button org-manager-button"
        onClick={handleOpenOrgManager}
        disabled={webBusy}
      >
        {webBusy ? 'Opening…' : 'Open org manager ↗'}
      </button>
      {webError && <p className="onboarding-error">{webError}</p>}

      {showJoinForm ? (
        <JoinForm
          token={joinToken}
          onTokenChange={setJoinToken}
          onSubmit={handleJoin}
          busy={joining}
          error={joinError}
          onCancel={() => {
            setShowJoinForm(false);
            setJoinToken('');
            setJoinError(null);
          }}
        />
      ) : (
        <button
          type="button"
          className="onboarding-button-link org-join-toggle"
          onClick={() => setShowJoinForm(true)}
        >
          + Join another org
        </button>
      )}
    </div>
  );
}

function JoinForm({
  token,
  onTokenChange,
  onSubmit,
  busy,
  error,
  onCancel,
}: {
  token: string;
  onTokenChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  error: string | null;
  onCancel?: () => void;
}) {
  return (
    <form className="race-join org-join-form" onSubmit={onSubmit}>
      <label className="race-join-field">
        <span>Join token</span>
        <input
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder="Paste your join token"
          autoFocus
        />
      </label>
      {error && <p className="onboarding-error">{error}</p>}
      <div className="org-join-actions">
        <button type="submit" className="onboarding-button" disabled={!token.trim() || busy}>
          {busy ? 'Joining…' : '+ Join another org'}
        </button>
        {onCancel && (
          <button type="button" className="onboarding-button-link" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
