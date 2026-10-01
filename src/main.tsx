import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createServices } from './compositionRoot.ts';
import { installGoogleAnalytics } from './infrastructure/browser/googleAnalytics.ts';
import { App } from './ui/App.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import './ui/styles.css';

const GOOGLE_ANALYTICS_MEASUREMENT_ID = 'G-RLYJX4KEZ9';

// Only the built site counts: sessions of `pnpm dev` would pollute the numbers.
if (import.meta.env.PROD) {
  installGoogleAnalytics(GOOGLE_ANALYTICS_MEASUREMENT_ID);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App services={createServices()} />
    </ErrorBoundary>
  </StrictMode>,
);
