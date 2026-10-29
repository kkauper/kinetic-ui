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
