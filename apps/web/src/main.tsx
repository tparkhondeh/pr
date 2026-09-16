import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
// Revalidate the session rather than displaying a browser back/forward snapshot after logout.
window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
if (!root) throw new Error('Root element is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
