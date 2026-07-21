import { useEffect } from 'react';

// A standalone app window (see electron/windows.ts `createAppWindow`, routed
// at `#/race-track/:joinCode` in main.tsx, opened via the Race tab's "Open
// race track ↗" button → window.api.openRaceTrack). Placeholder until Task
// D1 ports the full race-track view here.
export default function RaceTrack({ joinCode }: { joinCode: string }) {
  useEffect(() => {
    document.title = `Race ${joinCode} — Token Derby`;
  }, [joinCode]);

  return (
    <div className="race-track-window">
      <p className="popover-placeholder">Race track view for {joinCode} — coming soon.</p>
    </div>
  );
}
