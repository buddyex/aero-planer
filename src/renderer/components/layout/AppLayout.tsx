import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { blurLeafletMaps } from '../../utils/mapFocus';
import { CommsProvider, useComms } from '../../context/CommsContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import './AppLayout.css';

function AppLayoutInner() {
  const location = useLocation();
  const { openComms, hasUnread } = useComms();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    blurLeafletMaps();
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (!target.matches('input, textarea, select')) return;
      blurLeafletMaps();
    };
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <button
          type="button"
          className="app-layout__backdrop md:hidden"
          aria-label="Закрыть меню"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="app-layout__main">
        <Header
          onOpenComms={() => openComms()}
          hasUnread={hasUnread}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
        />
        <main className="app-layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <CommsProvider>
      <AppLayoutInner />
    </CommsProvider>
  );
}
