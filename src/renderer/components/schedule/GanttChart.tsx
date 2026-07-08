import { useMemo, type CSSProperties } from 'react';
import { useAppData } from '../../context/AppDataContext';
import type { Mission, RiskLevel } from '../../types';
import { MISSION_STATUS_SHORT } from '../../utils/missions';
import { parseMissionTime } from '../../utils/weather';
import { GlassCard } from '../ui/GlassCard';
import { OperatorLink } from '../ui/OperatorLink';
import './GanttChart.css';

const HOUR_MS = 60 * 60 * 1000;
const LABEL_COLUMN_WIDTH = 240;
const TRACK_MIN_WIDTH = 600;

function riskBarClass(risk: RiskLevel | undefined): string {
  if (risk === 'Высокий') return 'gantt-bar--high';
  if (risk === 'Средний') return 'gantt-bar--medium';
  return 'gantt-bar--low';
}

function riskMobileClass(risk: RiskLevel | undefined): string {
  if (risk === 'Высокий') return 'gantt-mobile-card--high';
  if (risk === 'Средний') return 'gantt-mobile-card--medium';
  return 'gantt-mobile-card--low';
}

function riskLabel(risk: RiskLevel | undefined): string {
  if (risk === 'Высокий') return 'Высокий риск';
  if (risk === 'Средний') return 'Средний риск';
  return 'Низкий риск';
}

function formatHour(d: Date): string {
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTimeRange(mission: Mission): string {
  const start = parseMissionTime(mission.start_time);
  const end = parseMissionTime(mission.end_time);
  return `${formatHour(start)} – ${formatHour(end)}`;
}

interface GanttChartProps {
  onMissionClick?: (mission: Mission) => void;
}

export function GanttChart({ onMissionClick }: GanttChartProps) {
  const { visibleMissions: userMissions, getSectorById, getDroneById, getOperatorById } =
    useAppData();

  const visibleMissions = useMemo(
    () =>
      userMissions
        .filter((m) => m.status === 'К выполнению' || m.status === 'Выполняется')
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [userMissions],
  );

  const hasMissions = visibleMissions.length > 0;

  const { rangeStart, rangeEnd, ticks } = useMemo(() => {
    if (!hasMissions) {
      const now = new Date();
      now.setHours(6, 0, 0, 0);
      const end = new Date(now);
      end.setHours(22, 0, 0, 0);
      const tickList: Date[] = [];
      for (let t = now.getTime(); t <= end.getTime(); t += 2 * HOUR_MS) {
        tickList.push(new Date(t));
      }
      return { rangeStart: now, rangeEnd: end, ticks: tickList };
    }

    const starts = visibleMissions.map((m) => parseMissionTime(m.start_time).getTime());
    const ends = visibleMissions.map((m) => parseMissionTime(m.end_time).getTime());
    const min = Math.min(...starts);
    const max = Math.max(...ends);

    const start = new Date(min);
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() - 1);

    const end = new Date(max);
    end.setMinutes(0, 0, 0);
    end.setHours(end.getHours() + 2);

    const tickList: Date[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 2 * HOUR_MS) {
      tickList.push(new Date(t));
    }

    return { rangeStart: start, rangeEnd: end, ticks: tickList };
  }, [visibleMissions, hasMissions]);

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  const getBarStyle = (mission: Mission) => {
    const start = parseMissionTime(mission.start_time).getTime();
    const end = parseMissionTime(mission.end_time).getTime();
    const left = ((start - rangeStart.getTime()) / totalMs) * 100;
    const width = ((end - start) / totalMs) * 100;
    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.max(2.5, width)}%`,
      minWidth: '2.75rem',
    };
  };

  const chartStyle = {
    '--gantt-label-width': `${LABEL_COLUMN_WIDTH}px`,
    '--gantt-track-min-width': `${TRACK_MIN_WIDTH}px`,
  } as CSSProperties;

  const renderMissionMeta = (mission: Mission) => {
    const drone = getDroneById(mission.drone_id);
    const operator = getOperatorById(mission.operator_id);
    const operatorLabel = mission.operator_name ?? operator?.full_name ?? '—';
    const droneLabel = mission.drone_serial ?? drone?.serial_number ?? '—';

    return (
      <>
        {droneLabel} ·{' '}
        <OperatorLink operatorId={mission.operator_id} className="operator-link">
          {operatorLabel}
        </OperatorLink>
      </>
    );
  };

  return (
    <GlassCard className="gantt-chart">
      <div className="gantt-chart__inner" style={chartStyle}>
        <div className="gantt-chart__header">
          <h3 className="gantt-chart__title">Таймлайн миссий</h3>
          <div className="gantt-chart__legend">
            <span className="gantt-legend gantt-legend--low">Низкий риск</span>
            <span className="gantt-legend gantt-legend--medium">Средний риск</span>
            <span className="gantt-legend gantt-legend--high">Высокий риск</span>
          </div>
        </div>

        {hasMissions && (
          <p className="gantt-chart__scroll-hint hidden md:block lg:hidden" aria-hidden="true">
            ← прокрутите для просмотра →
          </p>
        )}

        {/* Mobile cards */}
        <div className="gantt-chart__mobile md:hidden">
          {hasMissions ? (
            <ul className="gantt-chart__mobile-list">
              {visibleMissions.map((mission) => {
                const sector = getSectorById(mission.sector_id);
                const risk = mission.sector_risk_level ?? sector?.risk_level;

                return (
                  <li key={mission.id}>
                    <button
                      type="button"
                      className={`gantt-mobile-card ${riskMobileClass(risk)}${
                        mission.status === 'Выполняется' ? ' gantt-mobile-card--active' : ''
                      }`}
                      onClick={() => onMissionClick?.(mission)}
                    >
                      <div className="gantt-mobile-card__head">
                        <span className="gantt-mobile-card__time">{formatTimeRange(mission)}</span>
                        <span className="gantt-mobile-card__status">
                          {MISSION_STATUS_SHORT[mission.status]}
                        </span>
                      </div>
                      <span className="gantt-mobile-card__title">{mission.title}</span>
                      <span className="gantt-mobile-card__meta">{renderMissionMeta(mission)}</span>
                      <span className="gantt-mobile-card__risk">{riskLabel(risk)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="gantt-chart__empty">Нет активных или запланированных миссий</p>
          )}
        </div>

        {/* Desktop/tablet Gantt */}
        <div
          className={`gantt-chart__scroll hidden md:block${
            !hasMissions ? ' gantt-chart__scroll--empty' : ''
          }`}
        >
          <div className="gantt-chart__canvas">
            {hasMissions && (
              <>
                <div className="gantt-chart__axis">
                  {ticks.map((tick, i) => {
                    const pos = ((tick.getTime() - rangeStart.getTime()) / totalMs) * 100;
                    const showDay = i === 0 || tick.getDate() !== ticks[i - 1]?.getDate();
                    return (
                      <div
                        key={tick.getTime()}
                        className="gantt-chart__tick"
                        style={{ left: `${pos}%` }}
                      >
                        {showDay && (
                          <span className="gantt-chart__tick-day">{formatDayLabel(tick)}</span>
                        )}
                        <span className="gantt-chart__tick-time">{formatHour(tick)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="gantt-chart__grid">
                  {ticks.map((tick) => {
                    const pos = ((tick.getTime() - rangeStart.getTime()) / totalMs) * 100;
                    return (
                      <div
                        key={`grid-${tick.getTime()}`}
                        className="gantt-chart__grid-line"
                        style={{ left: `${pos}%` }}
                      />
                    );
                  })}
                </div>
              </>
            )}

            <div className="gantt-chart__rows">
              {!hasMissions ? (
                <p className="gantt-chart__empty">Нет активных или запланированных миссий</p>
              ) : (
                visibleMissions.map((mission) => {
                  const sector = getSectorById(mission.sector_id);
                  const risk = mission.sector_risk_level ?? sector?.risk_level;
                  const operator = getOperatorById(mission.operator_id);
                  const drone = getDroneById(mission.drone_id);
                  const operatorLabel = mission.operator_name ?? operator?.full_name ?? '—';
                  const droneLabel = mission.drone_serial ?? drone?.serial_number ?? '—';

                  return (
                    <div key={mission.id} className="gantt-chart__row">
                      <div className="gantt-chart__row-label">
                        <span className="gantt-chart__mission-title" title={mission.title}>
                          {mission.title}
                        </span>
                        <span
                          className="gantt-chart__mission-meta"
                          title={`${droneLabel} · ${operatorLabel}`}
                        >
                          {droneLabel} ·{' '}
                          <OperatorLink operatorId={mission.operator_id} className="operator-link">
                            {operatorLabel}
                          </OperatorLink>
                        </span>
                      </div>
                      <div className="gantt-chart__track">
                        <button
                          type="button"
                          className={`gantt-bar ${riskBarClass(risk)} ${
                            mission.status === 'Выполняется' ? 'gantt-bar--active' : ''
                          }`}
                          style={getBarStyle(mission)}
                          onClick={() => onMissionClick?.(mission)}
                          title={`${mission.title} — ${mission.sector_name ?? sector?.sector_name} (${risk}) · ${mission.status}`}
                        >
                          <span className="gantt-bar__label">
                            {MISSION_STATUS_SHORT[mission.status]}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
