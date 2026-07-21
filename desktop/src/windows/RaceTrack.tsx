import { useEffect, useRef } from 'react';
import { api } from '../api.js';
import { renderRace } from '../racetrack/render.js';
import '../racetrack/racetrack.css';

// A standalone app window (see electron/windows.ts `createAppWindow`, routed
// at `#/race-track/:joinCode` in main.tsx, opened via the Race tab's "Open
// race track ↗" button → window.api.openRaceTrack). Task D1: mounts the
// ported site race view (racetrack/render.ts) into `ref`, with its two
// browser seams injected — `getRace` calls window.api.getRace directly (the
// render core owns its own 60s poll loop, same cadence as the site), and
// `onExit` closes this window instead of navigating the site home.
export default function RaceTrack({ joinCode }: { joinCode: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `Race ${joinCode} — Token Derby`;
  }, [joinCode]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const destroy = renderRace(root, {
      joinCode,
      getRace: () => api.getRace(joinCode),
      getRaceSeries: () => api.getRaceSeries(joinCode),
      onExit: () => window.close(),
    });
    return destroy;
  }, [joinCode]);

  return <div className="race-track-window" ref={ref} />;
}
