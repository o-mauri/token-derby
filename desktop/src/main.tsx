import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Onboarding from './windows/Onboarding';
import './styles.css';

// Each BrowserWindow loads a fixed hash route (see electron/windows.ts
// `loadRoute`) and never navigates again, so a one-shot lookup is enough —
// no router or hashchange listener needed.
function Root() {
  const route = window.location.hash.replace(/^#/, '') || '/';
  if (route === '/onboarding') return <Onboarding />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
