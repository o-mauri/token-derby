import { DEVICE_LABEL_MAX_LENGTH } from '@token-derby/shared';

// C0/C1 controls (\p{Cc}) and Unicode format characters (\p{Cf} — zero-width
// characters, bidi overrides like U+202E). The label is shown verbatim on the
// /cli approval page and in the Account device list, so it is the human's
// "second thing to compare against their terminal"; either category lets a
// device rewrite how its own name reads without visibly matching what the
// person typed, or make two different labels render identically. Rejected at
// intake, not stripped or escaped at render, so a device sees its name was
// refused rather than silently getting a different one back. Deliberately
// narrow: accented letters, CJK, Cyrillic and a curly apostrophe are all
// outside these two categories and stay allowed.
const UNSAFE_LABEL_CHARS = /[\p{Cc}\p{Cf}]/u;

export type DeviceLabelResult =
  | { ok: true; label: string }
  | { ok: false; message: string };

/**
 * The one place a device label is validated. Both endpoints that accept one —
 * the device-flow start and the direct registration `link` uses — go through
 * here, so neither can drift into accepting a label the other refuses.
 */
export function validateDeviceLabel(raw: unknown): DeviceLabelResult {
  if (typeof raw !== 'string') return { ok: false, message: 'label is required' };
  const label = raw.trim();
  if (label.length < 1 || label.length > DEVICE_LABEL_MAX_LENGTH) {
    return { ok: false, message: `label must be 1–${DEVICE_LABEL_MAX_LENGTH} characters` };
  }
  if (UNSAFE_LABEL_CHARS.test(label)) {
    return { ok: false, message: 'label may not contain control or invisible characters' };
  }
  return { ok: true, label };
}
