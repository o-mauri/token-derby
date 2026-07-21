import { useEffect, useMemo, useState } from 'react';
import { api, DesktopApiError } from '../api.js';
import { usePoll } from '../lib/poll.js';
import { errorMessage } from '../lib/errors.js';
import { formatTokens } from '../lib/format.js';
import HorseSprite from '../sprites/HorseSprite.js';
import { mapStandings } from './race-standings.js';

// Join-code entry → live standings, polling `getRace` every 60s while a code
// is submitted. "You" is whichever of the jockey's stable horses (by
// stable_horse_id, loaded once via listStable) shows up in this race.
export default function Race() {
  const [joinCode, setJoinCode] = useState('');
  const [submittedCode, setSubmittedCode] = useState('');
  const [yourHorseIds, setYourHorseIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.listStable().then(
      (res) => setYourHorseIds(new Set(res.horses.map((h) => h.stable_horse_id))),
      () => {
        // Non-fatal: standings still render, just without "you" highlighting.
      },
    );
  }, []);

  const { data: race, error, loading } = usePoll(
    () => api.getRace(submittedCode),
    60000,
    submittedCode !== '',
  );

  const standings = useMemo(
    () => (race ? mapStandings(race, yourHorseIds) : []),
    [race, yourHorseIds],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = joinCode.trim();
    if (trimmed) setSubmittedCode(trimmed);
  }

  function reset() {
    setSubmittedCode('');
    setJoinCode('');
  }

  if (!submittedCode) {
    return (
      <form className="race-join" onSubmit={handleSubmit}>
        <label className="race-join-field">
          <span>Join code</span>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="ABC123"
            autoFocus
          />
        </label>
        <button type="submit" className="onboarding-button" disabled={!joinCode.trim()}>
          Watch race
        </button>
      </form>
    );
  }

  if (error) {
    const code = error instanceof DesktopApiError ? error.code : 'UNKNOWN';
    return (
      <div className="race-empty">
        <p className="race-empty-message">{errorMessage(code)}</p>
        <button type="button" className="onboarding-button-link" onClick={reset}>
          Try another code
        </button>
      </div>
    );
  }

  if (loading && !race) {
    return <p className="popover-placeholder">Loading race…</p>;
  }

  if (!race) return null;

  const isLive = race.status === 'live';

  return (
    <div className="race-panel">
      <div className="race-panel-header">
        <span className="race-panel-name">{race.name}</span>
        {isLive && <span className="race-live-indicator">LIVE · 60s</span>}
      </div>
      <ol className="race-standings">
        {standings.map((s) => (
          <li
            key={s.horse_id}
            className={
              'race-standing-row' +
              (s.isLeader ? ' race-standing-leader' : '') +
              (s.isYou ? ' race-standing-you' : '')
            }
          >
            <span className="race-standing-rank">{s.rank}</span>
            <HorseSprite colors={s.colors} hat={s.hat} size={28} />
            <span className="race-standing-name">
              {s.name}
              {s.isYou ? ' (you)' : ''}
            </span>
            <span className="race-standing-tokens">{formatTokens(s.tokens)}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="onboarding-button-link race-change-code" onClick={reset}>
        Change race
      </button>
    </div>
  );
}
