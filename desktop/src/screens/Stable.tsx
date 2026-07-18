import { useEffect, useState } from 'react';
import type { StableHorse } from '@token-derby/shared';
import { api, DesktopApiError } from '../api.js';
import { errorMessage } from '../lib/errors.js';
import { defaultColors } from '../lib/palette.js';
import HorseSprite from '../sprites/HorseSprite.js';

// Card per stable horse + "New horse". Editing always happens in a separate
// app window (see windows/HorseEditor.tsx) rather than inline here, so a
// click just asks main to open (or focus) that horse's editor.
export default function Stable() {
  const [horses, setHorses] = useState<StableHorse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.listStable().then(
      (res) => setHorses(res.horses),
      (err) => setError(err instanceof DesktopApiError ? errorMessage(err.code) : errorMessage('UNKNOWN')),
    );
  }

  useEffect(() => {
    load();
  }, []);

  async function handleNew() {
    setBusy(true);
    setError(null);
    try {
      const name = horses && horses.length > 0 ? `New Horse ${horses.length + 1}` : 'New Horse';
      const created = await api.createStableHorse({ name, colors: defaultColors() });
      await api.openHorseEditor(created.stable_horse_id);
      load();
    } catch (err) {
      setError(err instanceof DesktopApiError ? errorMessage(err.code) : errorMessage('UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  function handleEdit(stableHorseId: string) {
    api.openHorseEditor(stableHorseId).catch(() => {
      // Non-fatal: worst case the click does nothing and the user retries.
    });
  }

  if (error) {
    return (
      <div className="race-empty">
        <p className="race-empty-message">{error}</p>
      </div>
    );
  }

  if (!horses) {
    return <p className="popover-placeholder">Loading stable…</p>;
  }

  return (
    <div className="stable-panel">
      {horses.length === 0 ? (
        <p className="popover-placeholder">No horses yet — saddle one up below.</p>
      ) : (
        <ul className="stable-list">
          {horses.map((horse) => (
            <li key={horse.stable_horse_id} className="stable-card">
              <button
                type="button"
                className="stable-card-button"
                onClick={() => handleEdit(horse.stable_horse_id)}
              >
                <HorseSprite colors={horse.colors} hat={equippedHat(horse)} size={40} />
                <span className="stable-card-info">
                  <span className="stable-card-name">{horse.name}</span>
                  <span className="stable-card-stats">{statsLine(horse)}</span>
                </span>
                <span className="stable-card-edit" aria-hidden="true">
                  Edit ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="onboarding-button stable-new-button" onClick={handleNew} disabled={busy}>
        {busy ? 'Creating…' : '+ New horse'}
      </button>
    </div>
  );
}

function equippedHat(horse: StableHorse) {
  if (horse.equipped_hat == null || !horse.hats) return undefined;
  return horse.hats[horse.equipped_hat];
}

function statsLine(horse: StableHorse): string {
  const wins = horse.wins ?? 0;
  return `XP ${horse.xp} · ${wins} win${wins === 1 ? '' : 's'}`;
}
