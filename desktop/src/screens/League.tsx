import { useEffect, useMemo, useState } from 'react';
import type { SeasonStandings } from '@token-derby/shared';
import { api, DesktopApiError } from '../api.js';
import { errorMessage } from '../lib/errors.js';
import { formatTokens } from '../lib/format.js';
import { mapLeagueStandings, seasonLabel } from './league-standings.js';

// Season standings for the jockey's league, grouped by division (top flight
// first). Points only land here once a fixture finalises, so a race in progress
// is deliberately absent — see seasonLabel for why the round is worded as
// scheduling rather than completion.
export default function League({ orgName }: { orgName: string }) {
  const [standings, setStandings] = useState<SeasonStandings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yourHorseIds, setYourHorseIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.listStable().then(
      (res) => setYourHorseIds(new Set(res.horses.map((h) => h.stable_horse_id))),
      () => {
        // Non-fatal: the table still renders, just without "(you)".
      },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    api.getOrgLeagueStandings(orgName).then(
      (res) => {
        if (cancelled) return;
        setStandings(res.standings);
        setLoaded(true);
      },
      (err) => {
        if (cancelled) return;
        setError(errorMessage(err instanceof DesktopApiError ? err.code : 'UNKNOWN'));
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [orgName]);

  const groups = useMemo(
    () => (standings ? mapLeagueStandings(standings, yourHorseIds) : []),
    [standings, yourHorseIds],
  );

  if (!loaded) return <p className="popover-placeholder">Loading league…</p>;
  if (error) return <p className="popover-placeholder">{error}</p>;
  if (!standings) return <p className="popover-placeholder">This organisation has no league.</p>;

  return (
    <div className="league-panel">
      <div className="race-panel-header">
        <span className="race-panel-name">{standings.org_name}</span>
        <span className="league-season">{seasonLabel(standings)}</span>
      </div>

      {groups.map((g) => (
        <section key={g.division} className="league-division">
          <h3 className="league-division-name">{g.name}</h3>
          {g.rows.length === 0 ? (
            <p className="race-empty-message">Nobody in this division yet.</p>
          ) : (
            <ol className="league-rows">
              {g.rows.map((r) => (
                <li
                  key={`${g.division}-${r.rank}-${r.horseName}`}
                  className={'league-row' + (r.isYou ? ' league-row-you' : '')}
                >
                  <span className="league-rank">{r.rank}</span>
                  <span className={'league-zone' + (r.tone ? ` horse-detail-${r.tone}` : '')} aria-hidden="true">
                    {r.tone === 'good' ? '▲' : r.tone === 'bad' ? '▼' : ''}
                  </span>
                  <span className="league-name">
                    {r.horseName}
                    {r.isYou ? ' (you)' : ''}
                  </span>
                  <span className="league-tokens">{formatTokens(r.seasonTokens)}</span>
                  <span className="league-points">{r.points}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
