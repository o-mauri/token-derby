import { openWeb, marketOrigin, type Deps } from './open-web.js';
import { listActiveRaces } from '../stable/active-race.js';
import { getRace } from '../api/endpoints.js';

export async function derbymarketCommand(deps: Deps = {}): Promise<number> {
  return openWeb(await marketPath(), 'Derbymarket', deps, marketOrigin());
}

// The player's race under its organisation when there is exactly one; otherwise the picker.
async function marketPath(): Promise<string> {
  const local = process.env.TOKEN_DERBY_API_BASE ? '?host=market' : '';
  const codes = await listActiveRaces();
  if (codes.length === 1) {
    try {
      const race = await getRace(codes[0]!);
      if (race.organisation_name) return `/${encodeURIComponent(race.organisation_name)}/${codes[0]}${local}`;
    } catch { /* fall back to the picker */ }
  }
  return `/${local}`;
}
