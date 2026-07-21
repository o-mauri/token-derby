import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Onboarding from './windows/Onboarding';
import HorseEditor from './windows/HorseEditor';
import RaceTrack from './windows/RaceTrack';
import './styles.css';

// Each BrowserWindow loads a fixed hash route (see electron/windows.ts
// `loadRoute`) and never navigates again, so a one-shot lookup is enough —
// no router or hashchange listener needed.
function Root() {
  const route = window.location.hash.replace(/^#/, '') || '/';
  if (route === '/onboarding') return <Onboarding />;
  const horseMatch = route.match(/^\/horse\/(.+)$/);
  if (horseMatch) return <HorseEditor stableHorseId={decodeURIComponent(horseMatch[1]!)} />;
  const raceTrackMatch = route.match(/^\/race-track\/(.+)$/);
  if (raceTrackMatch) return <RaceTrack joinCode={decodeURIComponent(raceTrackMatch[1]!)} />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
