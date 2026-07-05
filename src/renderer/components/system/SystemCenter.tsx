import { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import type { SystemOverviewData } from '../../../shared/types/api.types';
import { useApi } from '../../context/ApiContext';
import { AuditLogTab } from './AuditLogTab';
import { IntegrityTab } from './IntegrityTab';
import { SystemErrorLogPanel } from './SystemErrorLogPanel';
import { SystemOverviewTab } from './SystemOverviewTab';
import '../maintenance/BatteryRegistry.css';
import './SystemCenter.css';

const POLL_INTERVAL_MS = 8_000;

type SystemTab = 'overview' | 'audit' | 'errors' | 'integrity';

const TAB_LABELS: Record<SystemTab, string> = {
  overview: 'Обзор',
  audit: 'Журнал аудита',
  errors: 'Журнал ошибок',
  integrity: 'Целостность',
};

const TAB_DESCRIPTIONS: Record<SystemTab, string> = {
  overview: 'Состояние сервисов, алерты и операционные KPI',
  audit: 'Действия пользователей системы с фильтрацией и пагинацией',
  errors: 'Системные ошибки backend, API, метео и интерфейса',
  integrity: 'Диагностика расхождений и legacy-очередей данных',
};

export function SystemCenter() {
  const api = useApi();
  const [activeTab, setActiveTab] = useState<SystemTab>('overview');
  const [recentErrorCount, setRecentErrorCount] = useState(0);
  const [overview, setOverview] = useState<SystemOverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  const loadOverview = useCallback(async () => {
    const result = await api.getSystemOverview();
    if (result.ok && result.data) {
      setOverview((prev) => {
        const next = result.data!;
        if (!prev) return next;

        const chartsUnchanged =
          JSON.stringify(prev.charts.hourlyActivity) === JSON.stringify(next.charts.hourlyActivity)
          && JSON.stringify(prev.charts.subsystemActivity ?? []) === JSON.stringify(next.charts.subsystemActivity ?? []);
        const kpiUnchanged = JSON.stringify(prev.kpi) === JSON.stringify(next.kpi);
        const alertsUnchanged = JSON.stringify(prev.alerts) === JSON.stringify(next.alerts);

        if (chartsUnchanged && kpiUnchanged && alertsUnchanged) {
          return {
            ...next,
            charts: prev.charts,
            kpi: prev.kpi,
            alerts: prev.alerts,
          };
        }

        return next;
      });
    }
    setLoadingOverview(false);
  }, [api]);

  useEffect(() => {
    void loadOverview();
    const timer = setInterval(() => void loadOverview(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadOverview]);

  useEffect(() => {
    void api.getSystemErrorStats({ days: 1 }).then((result) => {
      if (result.ok && result.data) {
        setRecentErrorCount(result.data.recent24h ?? result.data.todayCount ?? 0);
      }
    });
  }, [api]);

  return (
    <div className="system-center">
      <header className="system-center__header">
        <div>
          <h2 className="system-center__title">
            <Activity size={24} aria-hidden />
            Система
          </h2>
          <p className="system-center__desc">{TAB_DESCRIPTIONS[activeTab]}</p>
        </div>
      </header>

      <nav className="maintenance-journal__tabs" aria-label="Разделы системы">
        {(Object.keys(TAB_LABELS) as SystemTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`maintenance-journal__tab${activeTab === tab ? ' maintenance-journal__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
            {tab === 'errors' && recentErrorCount > 0 ? (
              <span className="maintenance-journal__tab-badge">{recentErrorCount}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <SystemOverviewTab data={overview} loading={loadingOverview} />
      ) : null}
      {activeTab === 'audit' ? <AuditLogTab /> : null}
      {activeTab === 'errors' ? (
        <SystemErrorLogPanel onRecentCountChange={setRecentErrorCount} />
      ) : null}
      {activeTab === 'integrity' ? <IntegrityTab /> : null}
    </div>
  );
}
