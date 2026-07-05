import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  ArcElement,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { AlertCircle, Clock, ShieldAlert, Activity } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useApi } from '../../context/ApiContext';
import type {
  SystemErrorLogEntry,
  SystemErrorSeverity,
  SystemErrorStats,
  SystemErrorSubsystem,
} from '../../../shared/types/api.types';
import { GlassCard } from '../ui/GlassCard';
import { KpiCard } from '../ui/KpiCard';
import './SystemErrorLogPanel.css';

Chart.register(
  DoughnutController,
  ArcElement,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const SUBSYSTEM_LABELS: Record<SystemErrorSubsystem | string, string> = {
  database: 'База данных',
  mysql: 'MySQL',
  sync: 'Синхронизация',
  api: 'API',
  auth: 'Аутентификация',
  websocket: 'WebSocket',
  renderer: 'Интерфейс',
  weather: 'Метеоданные',
  pdf: 'PDF',
};

const SEVERITY_LABELS: Record<SystemErrorSeverity, string> = {
  critical: 'Критическая',
  error: 'Ошибка',
  warning: 'Предупреждение',
};

const PHASE_LABELS = {
  startup: 'Запуск',
  runtime: 'Работа',
};

type PeriodKey = 'today' | '7d' | '30d';

const PERIOD_DAYS: Record<PeriodKey, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
};

interface ActiveFilters {
  severity?: SystemErrorSeverity;
  subsystem?: SystemErrorSubsystem;
  location?: string;
  date?: string;
}

interface SystemErrorLogPanelProps {
  onRecentCountChange?: (count: number) => void;
}

function formatTs(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch {
    return value;
  }
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function SystemErrorLogPanel({ onRecentCountChange }: SystemErrorLogPanelProps) {
  const api = useApi();
  const { isDark } = useTheme();
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [filters, setFilters] = useState<ActiveFilters>({});
  const [logs, setLogs] = useState<SystemErrorLogEntry[]>([]);
  const [stats, setStats] = useState<SystemErrorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const subsystemRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLCanvasElement>(null);
  const severityRef = useRef<HTMLCanvasElement>(null);
  const locationsRef = useRef<HTMLCanvasElement>(null);
  const chartsRef = useRef<Chart[]>([]);

  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.15)';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const days = PERIOD_DAYS[period];

    try {
      const [logsResult, statsResult] = await Promise.all([
        api.getSystemErrorLogs({
          days,
          limit: 500,
          ...filters,
        }),
        api.getSystemErrorStats({ days }),
      ]);

      if (logsResult.ok && logsResult.data) {
        setLogs(logsResult.data);
      } else if (!logsResult.ok) {
        setError(logsResult.error ?? 'Не удалось загрузить журнал ошибок.');
      }

      if (statsResult.ok && statsResult.data) {
        setStats(statsResult.data);
        onRecentCountChange?.(statsResult.data.recent24h ?? statsResult.data.todayCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки журнала.');
    } finally {
      setLoading(false);
    }
  }, [api, period, filters, onRecentCountChange]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    chartsRef.current.forEach((c) => c.destroy());
    chartsRef.current = [];

    if (!stats) return;

    const subsystemKeys = Object.keys(stats.bySubsystem);
    const subsystemValues = subsystemKeys.map((k) => stats.bySubsystem[k]);
    const subsystemLabels = subsystemKeys.map((k) => SUBSYSTEM_LABELS[k] ?? k);

    if (subsystemRef.current && subsystemKeys.length > 0) {
      chartsRef.current.push(
        new Chart(subsystemRef.current, {
          type: 'doughnut',
          data: {
            labels: subsystemLabels,
            datasets: [
              {
                data: subsystemValues,
                backgroundColor: [
                  'rgba(239, 68, 68, 0.85)',
                  'rgba(249, 115, 22, 0.85)',
                  'rgba(234, 179, 8, 0.85)',
                  'rgba(59, 130, 246, 0.85)',
                  'rgba(168, 85, 247, 0.85)',
                  'rgba(34, 197, 94, 0.85)',
                ],
                borderWidth: 0,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            onClick: (_evt, elements) => {
              if (!elements.length) return;
              const key = subsystemKeys[elements[0].index];
              setFilters((prev) => ({
                ...prev,
                subsystem: prev.subsystem === key ? undefined : (key as SystemErrorSubsystem),
              }));
            },
            plugins: {
              legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12 } },
            },
          },
        }),
      );
    }

    if (timelineRef.current) {
      chartsRef.current.push(
        new Chart(timelineRef.current, {
          type: 'line',
          data: {
            labels: stats.byDay.map((d) => formatShortDate(d.date)),
            datasets: [
              {
                label: 'Ошибок',
                data: stats.byDay.map((d) => d.count),
                borderColor: 'rgba(239, 68, 68, 0.9)',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                fill: true,
                tension: 0.35,
                pointRadius: 4,
                pointHoverRadius: 6,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_evt, elements) => {
              if (!elements.length) return;
              const day = stats.byDay[elements[0].index]?.date;
              if (!day) return;
              setFilters((prev) => ({
                ...prev,
                date: prev.date === day ? undefined : day,
              }));
            },
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: textColor }, grid: { color: gridColor } },
              y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
            },
          },
        }),
      );
    }

    if (severityRef.current) {
      const severities: SystemErrorSeverity[] = ['critical', 'error', 'warning'];
      chartsRef.current.push(
        new Chart(severityRef.current, {
          type: 'bar',
          data: {
            labels: severities.map((s) => SEVERITY_LABELS[s]),
            datasets: [
              {
                data: severities.map((s) => stats.bySeverity[s] ?? 0),
                backgroundColor: ['rgba(239, 68, 68, 0.85)', 'rgba(249, 115, 22, 0.85)', 'rgba(234, 179, 8, 0.85)'],
                borderWidth: 0,
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_evt, elements) => {
              if (!elements.length) return;
              const sev = severities[elements[0].index];
              setFilters((prev) => ({
                ...prev,
                severity: prev.severity === sev ? undefined : sev,
              }));
            },
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
              y: { ticks: { color: textColor }, grid: { display: false } },
            },
          },
        }),
      );
    }

    if (locationsRef.current && stats.topLocations.length > 0) {
      chartsRef.current.push(
        new Chart(locationsRef.current, {
          type: 'bar',
          data: {
            labels: stats.topLocations.map((l) => l.location),
            datasets: [
              {
                data: stats.topLocations.map((l) => l.count),
                backgroundColor: 'rgba(59, 130, 246, 0.75)',
                borderWidth: 0,
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_evt, elements) => {
              if (!elements.length) return;
              const loc = stats.topLocations[elements[0].index]?.location;
              if (!loc) return;
              setFilters((prev) => ({
                ...prev,
                location: prev.location === loc ? undefined : loc,
              }));
            },
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
              y: { ticks: { color: textColor }, grid: { display: false } },
            },
          },
        }),
      );
    }

    return () => {
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];
    };
  }, [stats, isDark, textColor, gridColor]);

  const hasActiveFilters = Boolean(filters.severity || filters.subsystem || filters.location || filters.date);

  if (loading && !stats) {
    return <p className="system-error-log__loading">Загрузка журнала ошибок…</p>;
  }

  return (
    <div className="system-error-log">
      {error ? (
        <p className="system-error-log__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="system-error-log__kpi-row">
        <KpiCard
          label="Всего за период"
          value={stats?.total ?? 0}
          icon={<Activity size={22} />}
          variant="default"
        />
        <KpiCard
          label="За сегодня"
          value={stats?.todayCount ?? 0}
          icon={<Clock size={22} />}
          variant="warning"
        />
        <KpiCard
          label="Критических"
          value={stats?.criticalCount ?? 0}
          icon={<ShieldAlert size={22} />}
          variant="danger"
        />
        <GlassCard className="system-error-log__last-card">
          <span className="system-error-log__last-label">Последняя ошибка</span>
          <span className="system-error-log__last-value">{formatTs(stats?.lastTimestamp)}</span>
        </GlassCard>
      </div>

      {stats && stats.total > 0 ? (
        <div className="system-error-log__charts">
          <GlassCard className="system-error-log__chart-card">
            <h4 className="system-error-log__chart-title">По подсистемам</h4>
            <div className="system-error-log__chart-wrap">
              <canvas ref={subsystemRef} />
            </div>
          </GlassCard>
          <GlassCard className="system-error-log__chart-card">
            <h4 className="system-error-log__chart-title">Динамика за 7 дней</h4>
            <div className="system-error-log__chart-wrap">
              <canvas ref={timelineRef} />
            </div>
          </GlassCard>
          <GlassCard className="system-error-log__chart-card">
            <h4 className="system-error-log__chart-title">По серьёзности</h4>
            <div className="system-error-log__chart-wrap">
              <canvas ref={severityRef} />
            </div>
          </GlassCard>
          <GlassCard className="system-error-log__chart-card">
            <h4 className="system-error-log__chart-title">Топ мест возникновения</h4>
            <div className="system-error-log__chart-wrap">
              <canvas ref={locationsRef} />
            </div>
          </GlassCard>
        </div>
      ) : null}

      <div className="system-error-log__filters">
        <span className="system-error-log__filters-label">Период:</span>
        {(Object.keys(PERIOD_DAYS) as PeriodKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`system-error-log__chip${period === key ? ' system-error-log__chip--active' : ''}`}
            onClick={() => setPeriod(key)}
          >
            {key === 'today' ? 'Сегодня' : key === '7d' ? '7 дней' : '30 дней'}
          </button>
        ))}
        {hasActiveFilters ? (
          <button
            type="button"
            className="system-error-log__chip system-error-log__chip--clear"
            onClick={() => setFilters({})}
          >
            Сбросить фильтры
          </button>
        ) : null}
      </div>

      {logs.length === 0 ? (
        <div className="system-error-log__empty">
          <AlertCircle size={36} className="system-error-log__empty-icon" aria-hidden />
          <p>Системных ошибок не зафиксировано за выбранный период.</p>
        </div>
      ) : (
        <div className="system-error-log__list">
          {logs.map((entry) => (
            <GlassCard
              key={entry.id}
              className={`system-error-log__entry system-error-log__entry--${entry.severity}`}
            >
              <div className="system-error-log__entry-header">
                <span className="system-error-log__entry-time">{formatTs(entry.timestamp)}</span>
                <span className={`system-error-log__entry-badge system-error-log__entry-badge--${entry.severity}`}>
                  {SEVERITY_LABELS[entry.severity]}
                </span>
                <span className="system-error-log__entry-time">
                  {PHASE_LABELS[entry.phase]} · {SUBSYSTEM_LABELS[entry.subsystem] ?? entry.subsystem}
                </span>
              </div>
              <p className="system-error-log__entry-message">{entry.messageRu}</p>
              <div className="system-error-log__entry-meta">
                <span>Место: {entry.location}</span>
                {Array.isArray(entry.context?.failedSources) && entry.context.failedSources.length > 0 ? (
                  <span>Недоступные API: {(entry.context.failedSources as string[]).join(', ')}</span>
                ) : null}
                {typeof entry.context?.successSource === 'string' ? (
                  <span>Использован источник: {entry.context.successSource}</span>
                ) : null}
                {entry.context?.role ? <span>Роль: {entry.context.role}</span> : null}
                {entry.context?.hostname ? <span>Устройство: {entry.context.hostname}</span> : null}
                {entry.context?.platform ? <span>Платформа: {entry.context.platform}</span> : null}
              </div>
              <div className="system-error-log__entry-details">
                <button
                  type="button"
                  className="system-error-log__entry-details-toggle"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  {expandedId === entry.id ? 'Скрыть технические детали' : 'Показать технические детали'}
                </button>
                {expandedId === entry.id ? (
                  <pre className="system-error-log__entry-tech">
                    {entry.messageTech}
                    {entry.stack ? `\n\n${entry.stack}` : ''}
                  </pre>
                ) : null}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
