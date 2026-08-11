import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ModelKey, StableHorse } from '@token-derby/shared';
import { MODEL_KEYS } from '@token-derby/shared';
import type { ActiveRaceStatus } from '../../electron/ipc.js';
import { api, DesktopApiError } from '../api.js';
import { usePoll } from '../lib/poll.js';
import { errorMessage } from '../lib/errors.js';
import { formatTokens } from '../lib/format.js';
import HorseSprite from '../sprites/HorseSprite.js';
import { mapStandings } from './race-standings.js';
import { raceStatusLabel } from './race-mode.js';
import { phaseAfterJoin, picksHorse, type JoinPhase, type RaceIntent } from './race-join.js';
import { detailRows } from './horse-detail.js';
import { divisionFilters, applyDivisionFilter } from './race-divisions.js';

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
// standings machinery above renders it. The panel's visibility is driven
// directly off `activeRace` (the getActiveRace/pushed-status source of
// truth) rather than off `standings` — `usePoll`'s 60s cadence means
// standings can lag well behind a just-started race, and gating Stop racing
// on that would leave a freshly-started race un-stoppable for up to a
// minute.
export default function Race() {
  const [joinCode, setJoinCode] = useState('');
  const [submittedCode, setSubmittedCode] = useState('');
  const [yourHorseIds, setYourHorseIds] = useState<Set<string>>(new Set());
  const [stable, setStable] = useState<StableHorse[]>([]);
  const [selectedHorseId, setSelectedHorseId] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelKey>('claude');

  const [activeRace, setActiveRace] = useState<ActiveRaceStatus | null>(null);
  const [activeRaceChecked, setActiveRaceChecked] = useState(false);

  // Did the user ask to race or only to spectate, and where did the join land.
  const [intent, setIntent] = useState<RaceIntent>('join');
  const [joinPhase, setJoinPhase] = useState<JoinPhase | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

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

  const { data: race, error, loading, refresh: refreshRace } = usePoll(
    () => api.getRace(submittedCode),
    60000,
    submittedCode !== '',
  );

  const allStandings = useMemo(
    () => (race ? mapStandings(race, yourHorseIds) : []),
    [race, yourHorseIds],
  );

  // League fixtures only: filter the field to one division, where rank means
  // division position (what league points are actually awarded on).
  const [division, setDivision] = useState<number | null>(null);
  const filters = useMemo(() => (race ? divisionFilters(race) : []), [race]);

  // A selected division can stop existing — changing race, or the league being
  // resized under us. Fall back to All rather than showing an empty list.
  useEffect(() => {
    if (division !== null && !filters.some((f) => f.value === division)) setDivision(null);
  }, [filters, division]);

  const standings = useMemo(
    () => applyDivisionFilter(allStandings, division),
    [allStandings, division],
  );

  // Accordion: one horse's detail panel open at a time, so the fixed-size
  // popover can't overflow.
  const [expandedHorseId, setExpandedHorseId] = useState<string | null>(null);
  const [autoExpanded, setAutoExpanded] = useState(false);

  const horsesById = useMemo(
    () => new Map((race?.horses ?? []).map((h) => [h.horse_id, h])),
    [race],
  );

  // Open the jockey's own horse once, the first time standings arrive. Guarded
  // by autoExpanded so collapsing it stays collapsed across the 60s poll.
  useEffect(() => {
    if (autoExpanded) return;
    const own = standings.find((s) => s.isYou);
    if (!own) return;
    setExpandedHorseId(own.horse_id);
    setAutoExpanded(true);
  }, [standings, autoExpanded]);

  function resetSelectedModel() {
    setSelectedModel('claude');
  }

  // Join is the primary path: the code alone is enough. Already in the race →
  // the engine resumes heartbeating and we land on the active panel; not in it
  // → we collect a horse and model. The join runs BEFORE submittedCode is set
  // so a bad code leaves the user on the form with an error, rather than
  // dropping them into a broken standings view.
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    setJoining(true);
    setJoinError(null);
    try {
      const phase = phaseAfterJoin(await api.joinRace(trimmed));
      setIntent('join');
      setJoinPhase(phase);
      setSubmittedCode(trimmed);
      if (phase.kind === 'racing') setActiveRace(await api.getActiveRace());
    } catch (err) {
      setJoinError(messageFor(err));
    } finally {
      setJoining(false);
    }
  }

  // Take over a horse the guard says is still being raced elsewhere.
  async function handleConfirmTakeover() {
    setJoining(true);
    setJoinError(null);
    try {
      const phase = phaseAfterJoin(await api.joinRace(submittedCode, { confirm: true }));
      setJoinPhase(phase);
      if (phase.kind === 'racing') setActiveRace(await api.getActiveRace());
    } catch (err) {
      setJoinError(messageFor(err));
    } finally {
      setJoining(false);
    }
  }

  function handleWatch() {
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    setIntent('watch');
    setJoinPhase(null);
    setJoinError(null);
    setSubmittedCode(trimmed);
  }

  function reset() {
    setSubmittedCode('');
    setJoinCode('');
    setNeedsConfirm(false);
    setStartError(null);
    setIntent('join');
    setJoinPhase(null);
    setJoinError(null);
    setExpandedHorseId(null);
    setAutoExpanded(false);
    setDivision(null);
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
        setJoinPhase({ kind: 'racing' });
        setActiveRace(await api.getActiveRace());
        // Standings still poll on their own 60s cadence — kick off an
        // immediate refetch so the just-joined horse's row shows up right
        // away rather than after the next scheduled tick.
        refreshRace();
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

  async function handleOpenTrack() {
    if (!activeRace) return;
    setOpeningTrack(true);
    try {
      await api.openRaceTrack(activeRace.joinCode);
    } catch (err) {
      setStartError(messageFor(err));
    } finally {
      setOpeningTrack(false);
    }
  }

  if (!activeRaceChecked && !submittedCode) {
    return <p className="popover-placeholder">Loading race…</p>;
  }

  if (!submittedCode) {
    return (
      <form className="race-join" onSubmit={handleJoin}>
        <label className="race-join-field">
          <span>Join code</span>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="ABC123"
            autoFocus
          />
        </label>
        <button type="submit" className="onboarding-button" disabled={joining || !joinCode.trim()}>
          {joining ? 'Joining…' : 'Join race'}
        </button>
        <button
          type="button"
          className="onboarding-button-link"
          onClick={handleWatch}
          disabled={joining || !joinCode.trim()}
        >
          Just watch
        </button>
        {joinError && <p className="onboarding-error">{joinError}</p>}
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
        {activeRace ? (
          <span className="race-live-indicator">LIVE · {raceStatusLabel(activeRace)}</span>
        ) : (
          isLive && <span className="race-live-indicator">LIVE · 60s</span>
        )}
      </div>

      {/* Join controls sit ABOVE the standings: the primary action must be
          reachable without scrolling past a list of other people's horses. */}
      {!activeRace && joinPhase?.kind === 'confirm' && (
        <div className="race-confirm">
          <p className="onboarding-error">
            You're already racing {joinPhase.horseName} somewhere else — take over here?
          </p>
          <div className="race-active-actions">
            <button
              type="button"
              className="onboarding-button"
              onClick={handleConfirmTakeover}
              disabled={joining}
            >
              {joining ? 'Taking over…' : 'Take over'}
            </button>
            <button type="button" className="onboarding-button-link" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!activeRace && picksHorse(intent, joinPhase) && (
        stable.length === 0 ? (
          <p className="popover-placeholder">Create a horse in the Stable tab to race.</p>
        ) : (
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
                {starting ? 'Starting…' : 'Join'}
              </button>
            )}
          </div>
        )
      )}

      {filters.length > 0 && (
        <label className="race-divisions">
          <span>Division</span>
          <select
            className="org-select"
            value={division === null ? 'all' : String(division)}
            onChange={(e) => setDivision(e.target.value === 'all' ? null : Number(e.target.value))}
          >
            {filters.map((f) => (
              <option key={String(f.value)} value={f.value === null ? 'all' : String(f.value)}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {division !== null && standings.length === 0 && (
        <p className="race-empty-message">No horses in this division.</p>
      )}

      <ol className="race-standings">
        {standings.map((s) => {
          const isOpen = expandedHorseId === s.horse_id;
          const horse = horsesById.get(s.horse_id);
          return (
            <li
              key={s.horse_id}
              className={
                'race-standing-item' +
                (s.isLeader ? ' race-standing-leader' : '') +
                (s.isYou ? ' race-standing-you' : '')
              }
            >
              <button
                type="button"
                className="race-standing-row"
                aria-expanded={isOpen}
                onClick={() => setExpandedHorseId(isOpen ? null : s.horse_id)}
              >
                <span className="race-standing-rank">{s.rank}</span>
                <HorseSprite colors={s.colors} hat={s.hat} size={28} />
                <span className="race-standing-name">
                  {s.name}
                  {s.isYou ? ' (you)' : ''}
                </span>
                <span className="race-standing-tokens">{formatTokens(s.tokens)}</span>
                <span className="race-standing-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && horse && (
                <dl className="horse-detail">
                  {detailRows(race, horse).map((row) => (
                    <Fragment key={row.label}>
                      <dt className="horse-detail-label">{row.label}</dt>
                      <dd
                        className={
                          'horse-detail-value' + (row.tone ? ` horse-detail-${row.tone}` : '')
                        }
                      >
                        {row.bar !== undefined && (
                          <span className="horse-detail-bar">
                            <span style={{ width: `${row.bar * 100}%` }} />
                          </span>
                        )}
                        {row.value}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ol>

      {activeRace && (
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
      )}

      {joinError && <p className="onboarding-error">{joinError}</p>}
      {startError && <p className="onboarding-error">{startError}</p>}

      {!activeRace && (
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
