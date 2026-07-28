import { THEMES, isThemeId, readTheme, setTheme } from '../theme.js';

/** A `Theme [ … ▾]` control. Mounted per-view (home, race header) rather than as
 *  a floating overlay — the ticker owns the bottom edge and TV mode fills the rest. */
export function createThemePicker(doc: Document): HTMLElement {
  const wrap = doc.createElement('label');
  wrap.className = 'theme-picker';

  const caption = doc.createElement('span');
  caption.className = 'theme-picker-caption';
  caption.textContent = 'Theme';

  const select = doc.createElement('select');
  select.className = 'theme-select';
  for (const theme of THEMES) {
    const opt = doc.createElement('option');
    opt.value = theme.id;
    opt.textContent = theme.label;
    select.appendChild(opt);
  }
  select.value = readTheme();

  select.addEventListener('change', () => {
    if (isThemeId(select.value)) setTheme(select.value, doc);
  });

  wrap.append(caption, select);
  return wrap;
}
