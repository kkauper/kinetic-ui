// Self-hosted variable font (no third-party requests). The @font-face rules are split by unicode-range, so the browser only downloads the subsets a page uses.
import '@fontsource-variable/hanken-grotesk/wght.css';
import '@radix-ui/themes/styles.css';
import '@kinetic-ui/spec/generated/tokens.css';
import './tokens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
