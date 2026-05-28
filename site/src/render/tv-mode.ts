const STORAGE_KEY = 'td:tv';
const AUTO_QUERY = '(min-aspect-ratio: 2/1) and (min-width: 1920px)';

function readStored(): 'on' | 'off' | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

export function isTvMode(): boolean {
  const stored = readStored();
  if (stored !== null) return stored === 'on';
  return window.matchMedia(AUTO_QUERY).matches;
}

export function applyInitialTvMode(): void {
  document.body.classList.toggle('tv', isTvMode());
}

export function setTvMode(on: boolean): void {
  document.body.classList.toggle('tv', on);
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore quota / disabled storage */
  }
}
