import { useMemo, useState, type ReactNode } from 'react';
import { Battery, CheckCircle2, Clock, Plane, Wrench } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { canForceWeatherSync } from '../../utils/permissions';
import {
  getManagerDashboardKpiGroups,
  getOperatorFleetKpiCards,
  isManagerLikeRole,
  maintenanceBacklogCount,
} from '../../utils/operationalKpis';
import { cn } from '../../utils/cn';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { BottomSheet, type BottomSheetSnap } from '../ui/BottomSheet';
import { SectorMap } from '../map/SectorMap';
import { UpcomingMissions } from './UpcomingMissions';
import { WeatherRiskChart } from './WeatherRiskChart';
import { DashboardWeatherControls } from './DashboardWeatherControls';
import { PendingApprovals } from './PendingApprovals';
import './Dashboard.css';

const hudPanelClass =
  'pointer-events-auto bg-[color-mix(in_srgb,var(--panel-solid)_72%,transparent)] backdrop-blur-xl border border-[var(--glass-border)] shadow-2xl rounded-[var(--radius-lg)]';

const hudSectionTitleClass =
  'text-[11px] font-medium uppercase tracking-wider text-[var(--text-primary)] font-mono';

const hudChipLabelClass =
  'text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)] leading-tight font-mono';

type MobileTab = 'fleet' | 'missions' | 'weather' | 'approvals';


function RadialProgress({
  value,
  max,
  colorClass,
  label,
  size = 'md',
  title,
}: {
  value: number;
  max: number;
  colorClass: string;
  label: string;
  size?: 'sm' | 'md';
  title?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = size === 'sm' ? 28 : 36;
  const view = size === 'sm' ? 72 : 88;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const box = size === 'sm' ? 'h-16 w-16' : 'h-24 w-24';
  const tip = title ?? label;

  return (
    <div
      className="flex flex-col items-center gap-1.5 shrink-0"
      title={tip}
      aria-label={`${tip}: ${value} из ${max} (${pct}%)`}
    >
      <div className={cn('relative', box)}>
        <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${view} ${view}`} aria-hidden>
          <circle
            cx={view / 2}
            cy={view / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            className="text-[var(--glass-border)]"
          />
          <circle
            cx={view / 2}
            cy={view / 2}
            r={r}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={colorClass}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-mono font-bold text-[var(--text-primary)]', size === 'sm' ? 'text-sm' : 'text-lg')}>
            {pct}%
          </span>
        </div>
      </div>
      <span className={hudChipLabelClass}>{label}</span>
      <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
        {value}/{max}
      </span>
    </div>
  );
}

function FleetStatusBar({
  label,
  value,
  max,
  barClass,
  pulse,
  title,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
  pulse?: boolean;
  title?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tip = title ?? label;

  return (
    <div className="space-y-1" title={tip} aria-label={`${tip}: ${value}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {pulse ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
            </span>
          ) : (
            <span className="inline-flex h-2 w-2 rounded-full bg-[var(--text-muted)]" />
          )}
          <span className={hudChipLabelClass}>{label}</span>
        </div>
        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--glass-border)]">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  decimals = 0,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  decimals?: number;
  title?: string;
}) {
  const tip = title ?? label;

  return (
    <div
      className="rounded-xl border border-[var(--glass-border)] bg-[var(--surface-hover)] px-2.5 py-2"
      title={tip}
      aria-label={`${tip}: ${value}`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[var(--text-secondary)]">
        {icon}
        <span className={hudChipLabelClass}>{label}</span>
      </div>
      <p className="font-mono text-lg font-bold leading-none text-[var(--text-primary)]">
        <AnimatedNumber value={value} decimals={decimals} />
      </p>
    </div>
  );
}

function FleetOverviewSection({
  dronesReadyCount,
  fleetTotal,
  dronesInAirCount,
  dronesPlannedCount,
  maintenanceCount,
  readinessPct,
  totalFlightHours,
  completedMissions,
  activeMissions,
  dronesCount,
  sectorsCount,
  compactKpis = false,
}: {
  dronesReadyCount: number;
  fleetTotal: number;
  dronesInAirCount: number;
  dronesPlannedCount: number;
  maintenanceCount: number;
  readinessPct: number;
  totalFlightHours: number;
  completedMissions: number;
  activeMissions: number;
  dronesCount: number;
  sectorsCount: number;
  /** Show only 4 key chips (mobile sheet). */
  compactKpis?: boolean;
}) {
  return (
    <>
      <section className="shrink-0 space-y-2.5">
        <h2 className={hudSectionTitleClass}>Статус флота</h2>
        <div className="flex items-center gap-3">
          <RadialProgress
            value={dronesReadyCount}
            max={fleetTotal}
            colorClass="stroke-emerald-400"
            label="Готовы"
            size="sm"
            title="Доля готовых БПЛА"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <FleetStatusBar
              label="В воздухе"
              value={dronesInAirCount}
              max={fleetTotal}
              barClass="bg-sky-400"
              pulse={dronesInAirCount > 0}
              title="БПЛА в воздухе"
            />
            <FleetStatusBar
              label="Запланировано"
              value={dronesPlannedCount}
              max={fleetTotal}
              barClass="bg-indigo-400"
              title="БПЛА с запланированными миссиями"
            />
            <FleetStatusBar
              label="ТО / ремонт"
              value={maintenanceCount}
              max={fleetTotal}
              barClass="bg-amber-400"
              title="БПЛА на техническом обслуживании или в ремонте"
            />
          </div>
        </div>
      </section>

      <section className="shrink-0 space-y-2">
        <h2 className={hudSectionTitleClass}>Оперативные показатели</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatChip
            icon={<Battery size={12} strokeWidth={1.75} />}
            label="Готовность"
            value={readinessPct}
            title="Готовность флота, %"
          />
          <StatChip
            icon={<Clock size={12} strokeWidth={1.75} />}
            label="Налёт, ч"
            value={totalFlightHours}
            decimals={1}
            title="Суммарный налёт флота, часы"
          />
          <StatChip
            icon={<CheckCircle2 size={12} strokeWidth={1.75} />}
            label="Успешные"
            value={completedMissions}
            title="Завершённые миссии"
          />
          <StatChip
            icon={<Plane size={12} strokeWidth={1.75} />}
            label="Активные"
            value={activeMissions}
            title="Миссии «К выполнению» и «Выполняется»"
          />
          {!compactKpis && (
            <>
              <StatChip
                icon={<Wrench size={12} strokeWidth={1.75} />}
                label="В парке"
                value={dronesCount}
                title="Всего БПЛА в парке"
              />
              <StatChip
                icon={<span className="text-[10px] font-bold">Σ</span>}
                label="Секторы"
                value={sectorsCount}
                title="Количество секторов полётов"
              />
            </>
          )}
        </div>
      </section>
    </>
  );
}

export function Dashboard() {
  const {
    drones,
    dronesReadyCount,
    dronesInAirCount,
    dronesPlannedCount,
    dronesOnMaintenanceCount,
    dronesInRepairCount,
    operationalOverview,
    sectors,
    missions,
  } = useAppData();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('peek');
  const [mobileTab, setMobileTab] = useState<MobileTab>('fleet');

  const showWeatherControls = Boolean(user && canForceWeatherSync(user.role));
  const showManagerOverview = isManagerLikeRole(user?.role);

  const operatorFleetCards = getOperatorFleetKpiCards({
    dronesReadyCount,
    dronesPlannedCount,
    dronesInAirCount,
    dronesOnMaintenanceCount,
    dronesInRepairCount,
  });

  const managerKpiGroups = getManagerDashboardKpiGroups(operationalOverview);
  const compactKpis = showManagerOverview
    ? managerKpiGroups.flatMap((g) => g.cards).slice(0, 4)
    : operatorFleetCards;

  const fleetTotal = Math.max(
    drones.length,
    dronesReadyCount +
      dronesInAirCount +
      dronesPlannedCount +
      dronesOnMaintenanceCount +
      dronesInRepairCount,
    1,
  );

  const totalFlightHours = useMemo(
    () => drones.reduce((sum, d) => sum + (d.flight_hours ?? 0), 0),
    [drones],
  );

  const readinessPct = useMemo(() => {
    if (drones.length === 0) return 0;
    return Math.round((dronesReadyCount / drones.length) * 100);
  }, [drones.length, dronesReadyCount]);

  const maintenanceCount = maintenanceBacklogCount(operationalOverview);

  const activeMissions = useMemo(
    () => missions.filter((m) => m.status === 'Выполняется' || m.status === 'К выполнению').length,
    [missions],
  );

  const fleetProps = {
    dronesReadyCount,
    fleetTotal,
    dronesInAirCount,
    dronesPlannedCount,
    maintenanceCount,
    readinessPct,
    totalFlightHours,
    completedMissions: operationalOverview.completed_missions,
    activeMissions,
    dronesCount: drones.length,
    sectorsCount: sectors.length,
  };

  const openSheetTab = (tab: MobileTab) => {
    setMobileTab(tab);
    if (sheetSnap === 'peek') setSheetSnap('half');
  };

  const mobileTabs: { id: MobileTab; label: string; hidden?: boolean }[] = [
    { id: 'fleet', label: 'Флот' },
    { id: 'missions', label: 'Вылеты' },
    { id: 'weather', label: 'Погода' },
    { id: 'approvals', label: 'Утверждения', hidden: !showManagerOverview },
  ];

  return (
    <div className="dashboard dashboard-hud relative h-full w-full overflow-hidden bg-[var(--bg-map)] text-[var(--text-primary)]">
      <div className="absolute inset-0 z-0">
        <SectorMap variant="hud" />
      </div>

      {isMobile ? (
        <div className="dashboard-hud__mobile absolute inset-0 z-10 flex flex-col pointer-events-none">
          <div
            id="dashboard-hud-map-toolbar"
            className="dashboard-hud__mobile-toolbar mx-3 mt-[max(0.75rem,env(safe-area-inset-top))] flex shrink-0 justify-end pointer-events-none"
          />

          <div className="relative min-h-0 flex-1">
            <BottomSheet
              snap={sheetSnap}
              onSnapChange={setSheetSnap}
              peekContent={
                <button
                  type="button"
                  className="dashboard-hud__peek"
                  onClick={() => setSheetSnap('half')}
                >
                  <span className="dashboard-hud__peek-stat">
                    <span className="dashboard-hud__peek-label">Готовы</span>
                    <span className="dashboard-hud__peek-value text-[var(--accent-secondary)]">
                      {dronesReadyCount}/{fleetTotal}
                    </span>
                  </span>
                  <span className="dashboard-hud__peek-stat">
                    <span className="dashboard-hud__peek-label">В воздухе</span>
                    <span className="dashboard-hud__peek-value text-[var(--accent-primary)]">{dronesInAirCount}</span>
                  </span>
                  <span className="dashboard-hud__peek-stat">
                    <span className="dashboard-hud__peek-label">Риск</span>
                    <span
                      className={cn(
                        'dashboard-hud__peek-value',
                        operationalOverview.high_risk_sectors > 0 && 'text-[var(--accent-amber)]',
                      )}
                    >
                      {operationalOverview.high_risk_sectors > 0
                        ? operationalOverview.high_risk_sectors
                        : 'OK'}
                    </span>
                  </span>
                </button>
              }
              header={
                <div className="dashboard-hud__tabs" role="tablist" aria-label="Разделы панели">
                  {mobileTabs
                    .filter((t) => !t.hidden)
                    .map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={mobileTab === tab.id}
                        className={cn(
                          'dashboard-hud__tab',
                          mobileTab === tab.id && 'dashboard-hud__tab--active',
                        )}
                        onClick={() => openSheetTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                </div>
              }
            >
              {mobileTab === 'fleet' && (
                <div className="flex flex-col gap-3">
                  <FleetOverviewSection {...fleetProps} compactKpis />
                </div>
              )}
              {mobileTab === 'missions' && (
                <div className="dashboard-hud__missions">
                  <UpcomingMissions />
                </div>
              )}
              {mobileTab === 'weather' && (
                <div className="dashboard-hud__weather flex flex-col gap-3">
                  {showWeatherControls && <DashboardWeatherControls />}
                  <WeatherRiskChart embedded />
                </div>
              )}
              {mobileTab === 'approvals' && showManagerOverview && (
                <div className="dashboard-hud__approvals">
                  <PendingApprovals />
                </div>
              )}
            </BottomSheet>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 z-10 flex flex-col p-4 md:p-6 pointer-events-none">
          <div
            className={cn(
              hudPanelClass,
              'dashboard-hud__topbar mb-3 flex w-full shrink-0 flex-wrap items-center gap-3 px-3 py-2 md:px-4',
            )}
          >
            <div
              className="dashboard-hud__metrics min-w-0 flex-1"
              role="group"
              aria-label="Оперативные KPI"
            >
              {compactKpis.map((card) => (
                <div
                  key={card.key}
                  className={cn(
                    'dashboard-hud__metric',
                    card.variant === 'success' && 'dashboard-hud__metric--success',
                    card.variant === 'warning' && 'dashboard-hud__metric--warning',
                    card.variant === 'danger' && 'dashboard-hud__metric--danger',
                  )}
                  title={card.label}
                  aria-label={`${card.label}: ${card.value}`}
                >
                  <span className="dashboard-hud__metric-icon" aria-hidden>
                    {card.icon}
                  </span>
                  <div className="dashboard-hud__metric-body">
                    <span className="dashboard-hud__metric-value">{card.value}</span>
                    <span className="dashboard-hud__metric-label">{card.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div
              id="dashboard-hud-map-toolbar"
              className="dashboard-hud__map-tools flex shrink-0 items-center justify-end"
            />
          </div>

          <div className="pointer-events-none flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row md:items-start md:justify-between">
            <aside
              className={cn(
                hudPanelClass,
                'dashboard-hud__side custom-scrollbar flex max-h-[42%] w-full flex-col gap-3 overflow-y-auto p-3 md:max-h-[calc(100%-0.5rem)] md:h-auto md:w-80 md:shrink-0',
              )}
            >
              <FleetOverviewSection {...fleetProps} />

              <section className="dashboard-hud__missions flex min-h-0 flex-1 flex-col overflow-hidden md:flex-none md:max-h-64">
                <UpcomingMissions />
              </section>
            </aside>

            <div className="pointer-events-none hidden min-w-0 flex-1 md:block" aria-hidden />

            <aside
              className={cn(
                hudPanelClass,
                'dashboard-hud__side custom-scrollbar flex max-h-[42%] w-full flex-col gap-3 overflow-y-auto p-3 md:max-h-[calc(100%-0.5rem)] md:h-auto md:w-80 md:shrink-0',
              )}
            >
              <section className="dashboard-hud__weather shrink-0 space-y-2">
                <h2 className={hudSectionTitleClass}>Телеметрия / Погода</h2>
                <WeatherRiskChart embedded />
              </section>

              {showManagerOverview && (
                <section className="dashboard-hud__approvals flex min-h-0 flex-col overflow-hidden md:max-h-56">
                  <PendingApprovals />
                </section>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
