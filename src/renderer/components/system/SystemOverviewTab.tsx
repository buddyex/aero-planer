import { useEffect, useMemo, useRef } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Activity, AlertTriangle, CheckCircle2, Server, Wifi, WifiOff } from 'lucide-react';
import type { SystemOverviewData } from '../../../shared/types/api.types';
import { useTheme } from '../../context/ThemeContext';
import { GlassCard } from '../ui/GlassCard';
import { KpiCard } from '../ui/KpiCard';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

interface SystemOverviewTabProps {
  data: SystemOverviewData | null;
  loading: boolean;
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h} ч ${m} мин`;
}

function buildBarOptions(textColor: string, gridColor: string, horizontal = false) {
  const valueScale = {
    beginAtZero: true,
    ticks: { color: textColor, stepSize: 1 },
    grid: { color: gridColor },
  };
  const categoryScale = {
    ticks: { color: textColor },
    grid: { display: false },
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: { legend: { display: false } },
    scales: horizontal
      ? { x: valueScale, y: categoryScale }
      : {
          x: { ticks: { color: textColor, maxTicksLimit: 12 }, grid: { color: gridColor } },
          y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
        },
    ...(horizontal ? { indexAxis: 'y' as const } : {}),
  };
}

export function SystemOverviewTab({ data, loading }: SystemOverviewTabProps) {
  const { isDark } = useTheme();
  const hourlyRef = useRef<HTMLCanvasElement>(null);
  const subsystemRef = useRef<HTMLCanvasElement>(null);
  const hourlyChartRef = useRef<Chart | null>(null);
  const subsystemChartRef = useRef<Chart | null>(null);

  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.15)';

  const subsystemActivity = data?.charts.subsystemActivity ?? [];
  const hourlyKey = useMemo(
    () => JSON.stringify(data?.charts.hourlyActivity ?? []),
    [data?.charts.hourlyActivity],
  );
  const subsystemKey = useMemo(
    () => JSON.stringify(subsystemActivity),
    [subsystemActivity],
  );

  useEffect(() => {
    if (!data || !hourlyRef.current) return;

    const hourly = data.charts.hourlyActivity;
    const labels = hourly.map((r) => `${r.hour}:00`);
    const values = hourly.map((r) => r.count);

    if (!hourlyChartRef.current) {
      hourlyChartRef.current = new Chart(hourlyRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'События',
              data: values,
              backgroundColor: 'rgba(56, 189, 248, 0.7)',
              borderRadius: 4,
            },
          ],
        },
        options: buildBarOptions(textColor, gridColor),
      });
      return;
    }

    hourlyChartRef.current.data.labels = labels;
    hourlyChartRef.current.data.datasets[0].data = values;
    hourlyChartRef.current.options = buildBarOptions(textColor, gridColor);
    hourlyChartRef.current.update('none');
  }, [data, hourlyKey, textColor, gridColor]);

  useEffect(() => {
    if (!data || !subsystemRef.current) return;

    const subsystems = data.charts.subsystemActivity ?? [];
    const labels = subsystems.map((r) => r.subsystem);
    const values = subsystems.map((r) => r.count);

    if (!subsystemChartRef.current) {
      if (subsystems.length === 0) return;

      subsystemChartRef.current = new Chart(subsystemRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'События',
              data: values,
              backgroundColor: 'rgba(99, 102, 241, 0.8)',
              borderRadius: 4,
            },
          ],
        },
        options: buildBarOptions(textColor, gridColor, true),
      });
      return;
    }

    if (subsystems.length === 0) {
      subsystemChartRef.current.destroy();
      subsystemChartRef.current = null;
      return;
    }

    subsystemChartRef.current.data.labels = labels;
    subsystemChartRef.current.data.datasets[0].data = values;
    subsystemChartRef.current.options = buildBarOptions(textColor, gridColor, true);
    subsystemChartRef.current.update('none');
  }, [data, subsystemKey, textColor, gridColor]);

  useEffect(() => {
    return () => {
      hourlyChartRef.current?.destroy();
      subsystemChartRef.current?.destroy();
      hourlyChartRef.current = null;
      subsystemChartRef.current = null;
    };
  }, []);

  if (loading && !data) {
    return <p className="system-center__loading">Загрузка обзора системы…</p>;
  }

  if (!data) {
    return <p className="system-center__loading">Не удалось загрузить данные.</p>;
  }

  const { health, kpi, alerts } = data;
  const hasSubsystemData = subsystemActivity.length > 0;

  return (
    <>
      <section className="system-center__section">
        <h3 className="system-center__section-title">
          <Server size={18} aria-hidden />
          Состояние сервисов
        </h3>
        <div className="system-center__health-grid">
          <GlassCard className="system-center__health-card">
            <span className="system-center__health-label">API</span>
            <span className={`system-center__health-value ${health.api ? 'system-center__health-value--ok' : 'system-center__health-value--err'}`}>
              {health.api ? <CheckCircle2 size={16} /> : <WifiOff size={16} />}
              {health.api ? 'Online' : 'Offline'}
            </span>
          </GlassCard>
          <GlassCard className="system-center__health-card">
            <span className="system-center__health-label">MySQL</span>
            <span className={`system-center__health-value ${health.mysql ? 'system-center__health-value--ok' : 'system-center__health-value--err'}`}>
              {health.mysql ? <CheckCircle2 size={16} /> : <WifiOff size={16} />}
              {health.mysql ? 'Подключена' : 'Недоступна'}
            </span>
          </GlassCard>
          <GlassCard className="system-center__health-card">
            <span className="system-center__health-label">WebSocket</span>
            <span className={`system-center__health-value ${health.websocket ? 'system-center__health-value--ok' : 'system-center__health-value--err'}`}>
              {health.websocket ? <Wifi size={16} /> : <WifiOff size={16} />}
              {health.websocket ? 'Активен' : 'Offline'}
            </span>
          </GlassCard>
          <GlassCard className="system-center__health-card">
            <span className="system-center__health-label">Uptime</span>
            <span className="system-center__health-value">{formatUptime(health.uptimeSec)}</span>
          </GlassCard>
          <GlassCard className="system-center__health-card">
            <span className="system-center__health-label">Версия</span>
            <span className="system-center__health-value">{health.version}</span>
          </GlassCard>
        </div>
      </section>

      {alerts.length > 0 ? (
        <section className="system-center__section">
          <h3 className="system-center__section-title">
            <AlertTriangle size={18} aria-hidden />
            Алерты
          </h3>
          <div className="system-center__alerts">
            {alerts.map((alert) => (
              <GlassCard
                key={alert.id}
                className={`system-center__alert system-center__alert--${alert.severity}`}
              >
                <div>
                  <p className="system-center__alert-title">{alert.title}</p>
                  <p className="system-center__alert-detail">{alert.detail}</p>
                </div>
                <span className="system-center__alert-count">{alert.count}</span>
              </GlassCard>
            ))}
          </div>
        </section>
      ) : null}

      <section className="system-center__section">
        <h3 className="system-center__section-title">
          <Activity size={18} aria-hidden />
          Операционные KPI
        </h3>
        <div className="system-center__kpi-row">
          <KpiCard label="Миссии: к выполнению" value={kpi.missions_planned} icon="▤" />
          <KpiCard label="Миссии: в полёте" value={kpi.missions_active} icon="✈" variant="warning" />
          <KpiCard label="Ожидают утверждения" value={kpi.missions_pending_approval} icon="⏳" variant="warning" />
          <KpiCard label="Дроны: готовы" value={kpi.drones_ready} icon="✓" variant="success" />
          <KpiCard label="Дроны: в воздухе" value={kpi.drones_in_air} icon="↑" />
          <KpiCard label="На ТО / ремонте" value={kpi.drones_maintenance} icon="⚙" />
          <KpiCard label="Операторов" value={kpi.operators_total} icon="👥" />
          <KpiCard label="Audit за 24 ч" value={kpi.audit_logs_24h} icon="📋" />
        </div>
      </section>

      <section className="system-center__section">
        <h3 className="system-center__section-title">Аналитика audit_logs</h3>
        <div className="system-center__chart-grid">
          <GlassCard className="system-center__chart-card">
            <h4>Активность по часам (24 ч)</h4>
            <div className="system-center__chart-canvas">
              <canvas ref={hourlyRef} />
            </div>
          </GlassCard>
          <GlassCard className="system-center__chart-card">
            <h4>Активность по подсистемам (7 дней)</h4>
            <div className="system-center__chart-canvas">
              {hasSubsystemData ? (
                <canvas ref={subsystemRef} />
              ) : (
                <p className="system-center__chart-empty">Нет событий за последние 7 дней</p>
              )}
            </div>
          </GlassCard>
        </div>
      </section>
    </>
  );
}
