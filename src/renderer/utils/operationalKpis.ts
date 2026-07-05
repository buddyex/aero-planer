import type {
  OperationalOverview,
  OperatorKPIs,
  OperatorRole,
  PilotKPIs,
  TechnicianKPIs,
} from '../types';

export type KpiVariant = 'default' | 'success' | 'warning' | 'danger';

export interface KpiCardConfig {
  key: string;
  label: string;
  value: number;
  variant: KpiVariant;
  icon: string;
}

export interface KpiGroupConfig {
  title: string;
  cards: KpiCardConfig[];
}

function emptyOperationalOverview(): OperationalOverview {
  return {
    planned_missions: 0,
    active_missions: 0,
    completed_missions: 0,
    drones_ready: 0,
    drones_in_air: 0,
    drones_planned: 0,
    drones_on_maintenance: 0,
    drones_in_repair: 0,
    drones_in_diagnostics: 0,
    high_risk_sectors: 0,
    operators_in_mission: 0,
  };
}

function emptyTechnicianKPIs(): TechnicianKPIs {
  return {
    maintenance_records: 0,
    open_maintenance_sessions: 0,
    battery_inspections: 0,
    batteries_pending_inspection: 0,
  };
}

function emptyPilotKPIs(): PilotKPIs {
  return {
    planned_missions: 0,
    active_missions: 0,
    completed_missions: 0,
    total_actions: 0,
  };
}

export function maintenanceBacklogCount(stats: OperationalOverview): number {
  return (
    stats.drones_on_maintenance + stats.drones_in_repair + stats.drones_in_diagnostics
  );
}

function getTechnicianKpiCards(kpis: TechnicianKPIs): KpiCardConfig[] {
  return [
    {
      key: 'maintenance_records',
      label: 'Записей ТО',
      value: kpis.maintenance_records,
      variant: 'success',
      icon: '⚙',
    },
    {
      key: 'open_maintenance_sessions',
      label: 'Открытых сессий',
      value: kpis.open_maintenance_sessions,
      variant: 'warning',
      icon: '▣',
    },
    {
      key: 'battery_inspections',
      label: 'Проверок АКБ',
      value: kpis.battery_inspections,
      variant: 'default',
      icon: '🔋',
    },
    {
      key: 'batteries_pending_inspection',
      label: 'АКБ к проверке',
      value: kpis.batteries_pending_inspection,
      variant: 'warning',
      icon: '!',
    },
  ];
}

function getPilotKpiCards(kpis: PilotKPIs): KpiCardConfig[] {
  return [
    {
      key: 'planned_missions',
      label: 'К выполнению',
      value: kpis.planned_missions,
      variant: 'default',
      icon: '▤',
    },
    {
      key: 'active_missions',
      label: 'Активных миссий',
      value: kpis.active_missions,
      variant: 'warning',
      icon: '✈',
    },
    {
      key: 'completed_missions',
      label: 'Завершено миссий',
      value: kpis.completed_missions,
      variant: 'success',
      icon: '✓',
    },
    {
      key: 'total_actions',
      label: 'Действий в системе',
      value: kpis.total_actions,
      variant: 'default',
      icon: '◎',
    },
  ];
}

function getManagerProfileKpiCards(stats: OperationalOverview): KpiCardConfig[] {
  return [
    {
      key: 'planned_missions',
      label: 'К выполнению',
      value: stats.planned_missions,
      variant: 'default',
      icon: '▤',
    },
    {
      key: 'active_missions',
      label: 'Активных миссий',
      value: stats.active_missions,
      variant: 'warning',
      icon: '✈',
    },
    {
      key: 'completed_missions',
      label: 'Завершено миссий',
      value: stats.completed_missions,
      variant: 'success',
      icon: '✓',
    },
    {
      key: 'drones_ready',
      label: 'Готовы к вылету',
      value: stats.drones_ready,
      variant: 'success',
      icon: '✓',
    },
    {
      key: 'maintenance_backlog',
      label: 'На ТО / ремонт',
      value: maintenanceBacklogCount(stats),
      variant: 'warning',
      icon: '⚙',
    },
    {
      key: 'high_risk_sectors',
      label: 'Секторов высокого риска',
      value: stats.high_risk_sectors,
      variant: 'warning',
      icon: '⚠',
    },
    {
      key: 'operators_in_mission',
      label: 'Операторов в миссии',
      value: stats.operators_in_mission,
      variant: 'default',
      icon: '👤',
    },
  ];
}

export function getProfileKpiConfig(
  role: OperatorRole,
  kpis: OperatorKPIs | null,
): KpiCardConfig[] {
  switch (role) {
    case 'Техник':
      return getTechnicianKpiCards({ ...emptyTechnicianKPIs(), ...(kpis as TechnicianKPIs) });
    case 'Руководитель':
    case 'Администратор':
      return getManagerProfileKpiCards({ ...emptyOperationalOverview(), ...(kpis as OperationalOverview) });
    default:
      return getPilotKpiCards({ ...emptyPilotKPIs(), ...(kpis as PilotKPIs) });
  }
}

export function getOperatorFleetKpiCards(stats: {
  dronesReadyCount: number;
  dronesPlannedCount: number;
  dronesInAirCount: number;
  dronesOnMaintenanceCount: number;
  dronesInRepairCount: number;
}): KpiCardConfig[] {
  return [
    {
      key: 'drones_ready',
      label: 'Готовы к вылету',
      value: stats.dronesReadyCount,
      variant: 'success',
      icon: '✓',
    },
    {
      key: 'drones_planned',
      label: 'Запланировано БПЛА',
      value: stats.dronesPlannedCount,
      variant: 'default',
      icon: '📅',
    },
    {
      key: 'drones_in_air',
      label: 'Дроны в воздухе',
      value: stats.dronesInAirCount,
      variant: 'default',
      icon: '✈',
    },
    {
      key: 'maintenance_backlog',
      label: 'На ТО / ремонт',
      value: stats.dronesOnMaintenanceCount + stats.dronesInRepairCount,
      variant: 'warning',
      icon: '⚙',
    },
  ];
}

export function getManagerDashboardKpiGroups(stats: OperationalOverview): KpiGroupConfig[] {
  return [
    {
      title: 'Миссии',
      cards: [
        {
          key: 'planned_missions',
          label: 'К выполнению',
          value: stats.planned_missions,
          variant: 'default',
          icon: '▤',
        },
        {
          key: 'pending_approvals',
          label: 'Требуют утверждения',
          value: stats.pending_approvals ?? 0,
          variant: stats.pending_approvals ? 'warning' : 'default',
          icon: '⏳',
        },
        {
          key: 'active_missions',
          label: 'Активных миссий',
          value: stats.active_missions,
          variant: 'warning',
          icon: '✈',
        },
        {
          key: 'completed_missions',
          label: 'Завершено миссий',
          value: stats.completed_missions,
          variant: 'success',
          icon: '✓',
        },
      ],
    },
    {
      title: 'Флот',
      cards: [
        {
          key: 'drones_ready',
          label: 'Готовы к вылету',
          value: stats.drones_ready,
          variant: 'success',
          icon: '✓',
        },
        {
          key: 'drones_in_air',
          label: 'Дроны в воздухе',
          value: stats.drones_in_air,
          variant: 'default',
          icon: '✈',
        },
        {
          key: 'maintenance_backlog',
          label: 'На ТО / ремонт',
          value: maintenanceBacklogCount(stats),
          variant: 'warning',
          icon: '⚙',
        },
        {
          key: 'drones_planned',
          label: 'Запланировано БПЛА',
          value: stats.drones_planned,
          variant: 'default',
          icon: '📅',
        },
      ],
    },
    {
      title: 'Обстановка',
      cards: [
        {
          key: 'high_risk_sectors',
          label: 'Секторов высокого риска',
          value: stats.high_risk_sectors,
          variant: 'warning',
          icon: '⚠',
        },
        {
          key: 'operators_in_mission',
          label: 'Операторов в миссии',
          value: stats.operators_in_mission,
          variant: 'default',
          icon: '👤',
        },
      ],
    },
  ];
}

export function isManagerLikeRole(role: OperatorRole | undefined): boolean {
  return role === 'Руководитель' || role === 'Администратор';
}
