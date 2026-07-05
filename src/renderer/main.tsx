import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ApiProvider } from './context/ApiContext';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import './styles/tailwind.css';
import './styles/global.css';
import './styles/forms.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <ApiProvider>
        <App />
      </ApiProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
