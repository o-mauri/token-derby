import { useEffect, useState } from 'react';
import type { CollectedHat, HorseColors, RollHatResponse, StableHorse } from '@token-derby/shared';
import { hatById } from '@token-derby/shared';
import { api, DesktopApiError } from '../api.js';
import { errorMessage } from '../lib/errors.js';
import { SLOTS, PALETTES, nextColor, prevColor, defaultColors, type Slot } from '../lib/palette.js';
import HorseSprite from '../sprites/HorseSprite.js';
import { mergeRollRefresh } from './horse-editor-logic.js';

type HatChoice = number | null; // null = unequipped; number = index into horse.hats[]

const SLOT_LABEL: Record<Slot, string> = {
  body: 'Body',
  mane: 'Mane',
  tail: 'Tail',
  saddle: 'Saddle',
};

// A standalone dark app window (see electron/windows.ts `createAppWindow`,
// routed at `#/horse/:id` in main.tsx). Mirrors cli/src/ui/HorseCreator.tsx's
// colour-cycling and hat-equip/roll logic, but as a full window rather than
// an inline ink prompt: everything round-trips through listStable/
// updateStableHorse/equipHat/rollHat/deleteStableHorse since there's no
// single-horse GET endpoint.
export default function HorseEditor({ stableHorseId }: { stableHorseId: string }) {
  const [horse, setHorse] = useState<StableHorse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  // Non-nullable so downstream nested functions (handleSave, cycle, …) never
  // need to re-narrow it — the real value arrives via load() and this
  // placeholder is only ever visible during the `!horse` loading guard below.
  const [colors, setColors] = useState<HorseColors>(defaultColors());
  const [hatChoice, setHatChoice] = useState<HatChoice>(null);

  const [saving, setSaving] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    api.listStable().then(
      (res) => {
        const found = res.horses.find((h) => h.stable_horse_id === stableHorseId);
        if (!found) {
          setLoadError('Horse not found in your stable.');
          return;
        }
        setHorse(found);
        setName(found.name);
        setColors(found.colors);
        setHatChoice(found.equipped_hat ?? null);
      },
      (err) => setLoadError(err instanceof DesktopApiError ? errorMessage(err.code) : errorMessage('UNKNOWN')),
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableHorseId]);

  useEffect(() => {
    if (horse) document.title = `${horse.name} — Token Derby`;
  }, [horse?.name]);

  if (loadError) {
    return (
      <div className="editor-window editor-empty">
        <p className="race-empty-message">{loadError}</p>
      </div>
    );
  }

  if (!horse) {
    return (
      <div className="editor-window editor-empty">
        <p className="popover-placeholder">Loading horse…</p>
      </div>
    );
  }

  const owned = horse.hats ?? [];
  const previewHat: CollectedHat | undefined = hatChoice !== null ? owned[hatChoice] : undefined;

  function setColorSlot(slot: Slot, value: string) {
    setColors((c) => ({ ...c, [slot]: value }));
  }

  function cycle(slot: Slot, dir: 1 | -1) {
    setColors((c) => ({ ...c, [slot]: dir === 1 ? nextColor(slot, c[slot]) : prevColor(slot, c[slot]) }));
  }

  async function handleEquip(choice: HatChoice) {
    setActionError(null);
    try {
      const updated = await api.equipHat(stableHorseId, { hat_index: choice });
      setHorse(updated);
      setHatChoice(updated.equipped_hat ?? null);
    } catch (err) {
      setActionError(err instanceof DesktopApiError ? errorMessage(err.code) : errorMessage('UNKNOWN'));
    }
  }

  async function handleRoll() {
    if (!horse) return;
    setRolling(true);
    setActionError(null);
    setMessage(null);
    try {
      const result: RollHatResponse = await api.rollHat(stableHorseId);
      setMessage(describeRoll(result));
      // Refresh hats/xp/equipped state from the server, but never clobber
      // the user's in-progress name/colour edits (see horse-editor-logic.ts).
      const res = await api.listStable();
      const fresh = res.horses.find((h) => h.stable_horse_id === stableHorseId);
      if (fresh) {
        const merged = mergeRollRefresh({ name, colors, horse, hatChoice }, fresh);
        setHorse(merged.horse);
        setHatChoice(merged.hatChoice);
      }
    } catch (err) {
      setActionError(err instanceof DesktopApiError ? errorMessage(err.code) : errorMessage('UNKNOWN'));
    } finally {
      setRolling(false);
    }
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setActionError('Name required.');
      return;
    }
    setSaving(true);
    setActionError(null);
    setMessage(null);
    try {
      const updated = await api.updateStableHorse(stableHorseId, { name: trimmed, colors });
      setHorse(updated);
      setName(updated.name);
      setColors(updated.colors);
      setMessage('Saved.');
    } catch (err) {
      setActionError(err instanceof DesktopApiError ? errorMessage(err.code) : errorMessage('UNKNOWN'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setActionError(null);
    try {
      await api.deleteStableHorse(stableHorseId);
      window.close();
    } catch (err) {
      setActionError(err instanceof DesktopApiError ? errorMessage(err.code) : errorMessage('UNKNOWN'));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="editor-window">
      <div className="editor-preview">
        <HorseSprite colors={colors} hat={previewHat} size={120} />
        <div className="editor-preview-stats">
          <span className="editor-preview-name">{horse.name}</span>
          <span className="editor-preview-stat">XP {horse.xp}</span>
          <span className="editor-preview-stat">
            {horse.wins ?? 0} win{(horse.wins ?? 0) === 1 ? '' : 's'} · {horse.races_entered ?? 0} race
            {(horse.races_entered ?? 0) === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="editor-form">
        <label className="onboarding-field editor-name-field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>

        <div className="editor-slots">
          {SLOTS.map((slot) => (
            <div key={slot} className="editor-slot">
              <div className="editor-slot-header">
                <span className="editor-slot-label">{SLOT_LABEL[slot]}</span>
                <div className="editor-slot-arrows">
                  <button type="button" className="editor-arrow" onClick={() => cycle(slot, -1)} aria-label={`Previous ${SLOT_LABEL[slot]} colour`}>
                    ‹
                  </button>
                  <button type="button" className="editor-arrow" onClick={() => cycle(slot, 1)} aria-label={`Next ${SLOT_LABEL[slot]} colour`}>
                    ›
                  </button>
                </div>
              </div>
              <div className="editor-swatch-strip">
                {PALETTES[slot].map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={
                      'editor-swatch' + (colors[slot] === swatch ? ' editor-swatch-selected' : '')
                    }
                    style={{ background: swatch }}
                    aria-label={`${SLOT_LABEL[slot]} ${swatch}`}
                    onClick={() => setColorSlot(slot, swatch)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="editor-hats">
          <div className="editor-hats-header">
            <span className="editor-slot-label">Hats</span>
            <button type="button" className="onboarding-button-secondary editor-roll-button" onClick={handleRoll} disabled={rolling}>
              {rolling ? 'Rolling…' : 'Roll'}
            </button>
          </div>
          <div className="editor-hat-grid">
            <button
              type="button"
              className={'editor-hat-tile' + (hatChoice === null ? ' editor-hat-tile-selected' : '')}
              onClick={() => handleEquip(null)}
            >
              Unequip
            </button>
            {owned.map((collected, index) => (
              <button
                key={`${collected.id}-${index}`}
                type="button"
                className={'editor-hat-tile' + (hatChoice === index ? ' editor-hat-tile-selected' : '')}
                onClick={() => handleEquip(index)}
              >
                {hatLabel(collected)}
              </button>
            ))}
          </div>
        </div>

        {message && <p className="editor-message">{message}</p>}
        {actionError && <p className="onboarding-error">{actionError}</p>}

        <div className="editor-actions">
          <button type="button" className="onboarding-button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="onboarding-button-secondary editor-delete-button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : confirmDelete ? 'Confirm delete?' : 'Delete'}
          </button>
          {confirmDelete && !deleting && (
            <button type="button" className="onboarding-button-link" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function hatLabel(collected: CollectedHat): string {
  const def = hatById(collected.id);
  if (!def) return collected.id;
  const variantSuffix =
    def.rarity !== 'legendary' && collected.variant !== undefined ? ` #${collected.variant + 1}` : '';
  return `${def.name}${variantSuffix}`;
}

function describeRoll(result: RollHatResponse): string {
  if (result.result === 'hat') {
    const def = hatById(result.collected.id);
    return `New hat: ${def?.name ?? result.collected.id}! ${result.remaining_rolls} roll${result.remaining_rolls === 1 ? '' : 's'} left.`;
  }
  if (result.result === 'duplicate') {
    return `Duplicate — +${result.xp_awarded} XP instead. ${result.remaining_rolls} roll${result.remaining_rolls === 1 ? '' : 's'} left.`;
  }
  return `No hat this time — +${result.xp_awarded} XP. ${result.remaining_rolls} roll${result.remaining_rolls === 1 ? '' : 's'} left.`;
}
