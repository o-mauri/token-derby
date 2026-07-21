import { useEffect, useMemo, useState } from 'react';
import type { ModelKey, StableHorse } from '@token-derby/shared';
import { MODEL_KEYS } from '@token-derby/shared';
import type { ActiveRaceStatus } from '../../electron/ipc.js';
import { api, DesktopApiError } from '../api.js';
import { usePoll } from '../lib/poll.js';
import { errorMessage } from '../lib/errors.js';
import { formatTokens } from '../lib/format.js';
import HorseSprite from '../sprites/HorseSprite.js';
import { mapStandings } from './race-standings.js';
import { raceStatusLabel, canRace } from './race-mode.js';

const MODEL_LABELS: Record<ModelKey, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };

function messageFor(err: unknown): string {
  return errorMessage(err instanceof DesktopApiError ? err.code : 'UNKNOWN');
}

// Join-code entry → live standings, polling `getRace` every 60s while a code
// is submitted. "You" is whichever of the jockey's stable horses (by
// stable_horse_id, loaded once via listStable) shows up in this race.
//
// Layered on top (Task C1): a horse-picker + Race button that actually joins
// (window.api.startRace), and an active-race panel — driven by
// getActiveRace() on mount plus the pushed RACING_STATUS_CHANNEL updates —
// with a LIVE indicator, Stop racing, and Open race track. Whenever a race
// is active, `submittedCode` is kept in step with its join code so the same
// standings machinery above renders it; canRace() (race-mode.ts) decides
// which of the two (picker vs. active panel) to show based on whether that
// active horse has actually shown up in these standings yet.
export default function Race() {
  const [joinCode, setJoinCode] = useState('');
  const [submittedCode, setSubmittedCode] = useState('');
  const [yourHorseIds, setYourHorseIds] = useState<Set<string>>(new Set());
  const [stable, setStable] = useState<StableHorse[]>([]);
  const [selectedHorseId, setSelectedHorseId] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelKey>('claude');

  const [activeRace, setActiveRace] = useState<ActiveRaceStatus | null>(null);
  const [activeRaceChecked, setActiveRaceChecked] = useState(false);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [openingTrack, setOpeningTrack] = useState(false);

  useEffect(() => {
    api.listStable().then(
      (res) => {
        setYourHorseIds(new Set(res.horses.map((h) => h.stable_horse_id)));
        setStable(res.horses);
        setSelectedHorseId((prev) => prev || res.horses[0]?.stable_horse_id || '');
      },
      () => {
        // Non-fatal: standings still render, just without "you" highlighting
        // or a horse picker.
      },
    );
  }, []);

  useEffect(() => {
    api.getActiveRace().then(
      (status) => {
        setActiveRace(status);
        setActiveRaceChecked(true);
      },
      () => setActiveRaceChecked(true),
    );
    return api.onRacingStatus(setActiveRace);
  }, []);

  // Whichever race is actively racing takes over the join-code slot the
  // spectate machinery below polls, so the active panel always has live
  // standings to render.
  useEffect(() => {
    if (activeRace && activeRace.joinCode !== submittedCode) {
      setSubmittedCode(activeRace.joinCode);
    }
  }, [activeRace, submittedCode]);

  const { data: race, error, loading } = usePoll(
    () => api.getRace(submittedCode),
    60000,
    submittedCode !== '',
  );

  const standings = useMemo(
    () => (race ? mapStandings(race, yourHorseIds) : []),
    [race, yourHorseIds],
  );

  // Non-null once the active race's horse actually shows up in these
  // standings — null for the brief window right after starting, before the
  // next `getRace` poll catches up with the newly-joined code.
  const activePanel: ActiveRaceStatus | null =
    activeRace && !canRace(standings, activeRace) ? activeRace : null;

  function resetSelectedModel() {
    setSelectedModel('claude');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = joinCode.trim();
    if (trimmed) setSubmittedCode(trimmed);
  }

  function reset() {
    setSubmittedCode('');
    setJoinCode('');
    setNeedsConfirm(false);
    setStartError(null);
  }

  async function handleRace(confirm: boolean) {
    if (!selectedHorseId || !submittedCode) return;
    setStarting(true);
    setStartError(null);
    try {
      const result = await api.startRace(
        submittedCode,
        selectedHorseId,
        selectedModel,
        confirm ? { confirm: true } : undefined,
      );
      if (result.needsConfirm) {
        setNeedsConfirm(true);
      } else {
        setNeedsConfirm(false);
        setActiveRace(await api.getActiveRace());
      }
    } catch (err) {
      setStartError(messageFor(err));
    } finally {
      setStarting(false);
    }
  }

  async function handleStop() {
    setStopping(true);
    try {
      await api.stopRace();
      setActiveRace(null);
    } catch (err) {
      setStartError(messageFor(err));
    } finally {
      setStopping(false);
    }
  }

  function handleOpenTrack() {
    if (!activeRace) return;
    setOpeningTrack(true);
    api.openRaceTrack(activeRace.joinCode).finally(() => setOpeningTrack(false));
  }

  if (!activeRaceChecked && !submittedCode) {
    return <p className="popover-placeholder">Loading race…</p>;
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
        {activePanel ? (
          <span className="race-live-indicator">LIVE · {raceStatusLabel(activePanel)}</span>
        ) : (
          isLive && <span className="race-live-indicator">LIVE · 60s</span>
        )}
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

      {activePanel ? (
        <div className="race-active-actions">
          <button
            type="button"
            className="onboarding-button-secondary"
            onClick={handleStop}
            disabled={stopping}
          >
            {stopping ? 'Stopping…' : 'Stop racing'}
          </button>
          <button
            type="button"
            className="onboarding-button-link"
            onClick={handleOpenTrack}
            disabled={openingTrack}
          >
            Open race track ↗
          </button>
        </div>
      ) : activeRace === null && stable.length === 0 ? (
        <p className="popover-placeholder">Create a horse in the Stable tab to race.</p>
      ) : activeRace === null ? (
        <div className="race-mode-picker">
          <label className="race-mode-field">
            <span>Horse</span>
            <select
              className="org-select"
              value={selectedHorseId}
              onChange={(e) => setSelectedHorseId(e.target.value)}
            >
              {stable.map((h) => (
                <option key={h.stable_horse_id} value={h.stable_horse_id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-segmented" role="radiogroup" aria-label="Primary model">
            {MODEL_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selectedModel === key}
                className={'settings-segment' + (selectedModel === key ? ' settings-segment-active' : '')}
                onClick={() => setSelectedModel(key)}
              >
                {MODEL_LABELS[key]}
              </button>
            ))}
          </div>

          {needsConfirm ? (
            <div className="race-confirm">
              <p className="onboarding-error">
                This horse looks like it's already racing elsewhere — continue anyway?
              </p>
              <div className="race-active-actions">
                <button
                  type="button"
                  className="onboarding-button"
                  onClick={() => handleRace(true)}
                  disabled={starting}
                >
                  {starting ? 'Starting…' : 'Race anyway'}
                </button>
                <button
                  type="button"
                  className="onboarding-button-link"
                  onClick={() => setNeedsConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="onboarding-button"
              onClick={() => handleRace(false)}
              disabled={starting || !selectedHorseId}
            >
              {starting ? 'Starting…' : 'Race'}
            </button>
          )}
          {startError && <p className="onboarding-error">{startError}</p>}
        </div>
      ) : null}

      {!activePanel && (
        <button
          type="button"
          className="onboarding-button-link race-change-code"
          onClick={() => {
            reset();
            resetSelectedModel();
          }}
        >
          Change race
        </button>
      )}
    </div>
  );
}
