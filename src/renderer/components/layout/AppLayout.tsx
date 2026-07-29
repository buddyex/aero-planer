import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { blurLeafletMaps } from '../../utils/mapFocus';
import { CommsProvider, useComms } from '../../context/CommsContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import './AppLayout.css';

export interface AppLayoutOutletContext {
  onMenuToggle: () => void;
  sidebarOpen: boolean;
  onOpenComms: () => void;
  hasUnread: boolean;
}

function AppLayoutInner() {
  const location = useLocation();
  const { openComms, hasUnread } = useComms();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isDashboardHud = location.pathname === '/';

  useEffect(() => {
    blurLeafletMaps();
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (!target.matches('input, textarea, select')) return;
      blurLeafletMaps();
    };
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, []);

  const outletContext: AppLayoutOutletContext = {
    onMenuToggle: () => setSidebarOpen((v) => !v),
    sidebarOpen,
    onOpenComms: () => openComms(),
    hasUnread,
  };

  return (
    <div className="app-layout">
      <Header
        onOpenComms={() => openComms()}
        hasUnread={hasUnread}
        sidebarOpen={sidebarOpen}
        onMenuToggle={() => setSidebarOpen((v) => !v)}
      />
      <div className="app-layout__body">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {sidebarOpen && (
          <button
            type="button"
            className="app-layout__backdrop"
            aria-label="Закрыть меню"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div className="app-layout__main">
          <main
            className={`app-layout__content${isDashboardHud ? ' app-layout__content--hud' : ''}`}
          >
            <Outlet context={outletContext} />
          </main>
        </div>
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
