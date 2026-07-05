import type { OperatorKPIs } from '../../renderer/types';

export interface ApiResult<T = unknown> {
  ok: boolean;
  error?: string;
  message?: string;
  code?: string;
  data?: T;
}

export interface SectorRiskRow {
  id: number;
  sector_name: string;
  risk_level: string;
  center_lat?: number;
  center_lon?: number;
  radius_km?: number;
  boundary_polygon?: string | null;
  shape_type?: string;
  wind_speed?: number;
  temperature?: number;
  precipitation?: string;
  weather_source?: string;
  last_update?: string;
  coordinates?: { lat: number; lon: number } | null;
}

export interface CreateSectorPayload {
  sectorName: string;
  centerLat: number;
  centerLon: number;
  radiusKm?: number;
}

export interface WeatherData {
  id: number;
  sector_id: number;
  wind_speed: number;
  temperature: number;
  precipitation: string;
  timestamp: string;
  isCached: boolean;
}

export interface WeatherResult extends ApiResult<WeatherData> {
  sector?: { id: number; sector_name: string; risk_level: string };
  source?: string;
  coordinates?: { lat: number; lon: number };
}

export interface DroneRow {
  id: number;
  name: string;
  serial_number: string;
  max_wind_speed: number;
  battery_capacity: number;
  payload_capacity: number;
  flight_time_max: number;
  flight_hours?: number;
  status: string;
}

export interface DroneInput {
  name: string;
  serial_number: string;
  max_wind_speed: number;
  battery_capacity: number;
  payload_capacity: number;
  flight_time_max: number;
  status?: string;
}

export interface BatteryRow {
  id: string;
  serial_number: string;
  type: string;
  capacity: number;
  cycle_count: number;
  status: string;
}

export interface BatteryInspectionLogRow {
  id: number;
  battery_id: string;
  operator_id: number;
  inspection_date: string;
  cycle_count_at_inspection: number;
  visual_ok: number;
  connectors_ok: number;
  balance_ok: number;
  test_cycle_ok: number;
  capacity_percent: number;
  result: 'Пройдена' | 'Не пройдена';
  notes?: string | null;
  battery_serial?: string;
  operator_name?: string;
}

export interface BatteryInspectionPayload {
  visual_ok: boolean;
  connectors_ok: boolean;
  balance_ok: boolean;
  test_cycle_ok: boolean;
  capacity_percent: number;
  result: 'Пройдена' | 'Не пройдена';
  notes?: string;
}

export interface AuthUserRow {
  id: number;
  full_name: string;
  login: string;
  role: string;
}

export interface SystemHealthData {
  ok: boolean;
  api: boolean;
  mysql: boolean;
  websocket: boolean;
  version: string;
  uptimeSec: number;
}

export interface SystemAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  count: number;
}

export interface SystemOverviewKpi {
  missions_planned: number;
  missions_active: number;
  missions_pending_approval: number;
  missions_completed: number;
  drones_ready: number;
  drones_in_air: number;
  drones_maintenance: number;
  operators_total: number;
  audit_logs_24h: number;
}

export interface SystemOverviewData {
  health: SystemHealthData;
  kpi: SystemOverviewKpi;
  alerts: SystemAlert[];
  charts: {
    hourlyActivity: { hour: string; count: number }[];
    subsystemActivity: { subsystem: string; count: number }[];
  };
}

export interface AuditLogRow {
  id: string;
  operator_id: number | null;
  action_text: string;
  timestamp: string;
  operator_name?: string | null;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditLogFilters {
  limit?: number;
  offset?: number;
  since?: string;
  until?: string;
  operatorId?: number;
  search?: string;
}

export interface IntegrityCheckItem {
  id: string;
  label: string;
  meta?: string;
}

export interface IntegrityCheck {
  id: string;
  category: string;
  severity: 'ok' | 'warning' | 'critical';
  title: string;
  count: number;
  detail: string;
  items: IntegrityCheckItem[];
}

export interface IntegrityReport {
  checks: IntegrityCheck[];
}

export type SystemErrorSeverity = 'critical' | 'error' | 'warning';
export type SystemErrorPhase = 'startup' | 'runtime';
export type SystemErrorSubsystem =
  | 'database'
  | 'mysql'
  | 'sync'
  | 'api'
  | 'auth'
  | 'websocket'
  | 'renderer'
  | 'weather'
  | 'pdf';

export interface SystemErrorLogEntry {
  id: string;
  timestamp: string;
  severity: SystemErrorSeverity;
  phase: SystemErrorPhase;
  subsystem: SystemErrorSubsystem;
  location: string;
  messageRu: string;
  messageTech: string;
  stack?: string | null;
  code?: string | null;
  context?: {
    platform?: string;
    hostname?: string;
    appVersion?: string;
    role?: string;
    operatorId?: number;
    operatorName?: string;
    dbPath?: string;
    remoteApiUrl?: string;
    [key: string]: unknown;
  };
}

export interface SystemErrorStats {
  total: number;
  todayCount: number;
  criticalCount: number;
  lastTimestamp: string | null;
  recent24h?: number;
  bySubsystem: Record<string, number>;
  bySeverity: Record<SystemErrorSeverity, number>;
  byDay: { date: string; count: number }[];
  topLocations: { location: string; count: number }[];
}

export interface SystemErrorFilters {
  days?: number;
  limit?: number;
  severity?: SystemErrorSeverity;
  subsystem?: SystemErrorSubsystem;
  location?: string;
  date?: string;
  sinceHours?: number;
}

export interface RendererErrorPayload {
  message?: string;
  error?: string;
  stack?: string;
  location?: string;
  type?: 'error' | 'unhandledrejection';
  componentStack?: string;
  url?: string;
  phase?: SystemErrorPhase;
  severity?: SystemErrorSeverity;
}

export interface MessageRow {
  id: string;
  sender_id: number;
  receiver_id: number;
  text: string;
  timestamp: string;
  sync_status: number;
  is_read: number;
}

export interface UnreadMessageRow extends MessageRow {
  sender_name: string;
}

export interface ChatContactRow {
  id: number;
  full_name: string;
  role: string;
  duty_status: string;
}

export interface OperatorProfileRow {
  id: number;
  full_name: string;
  login: string;
  role: string;
  duty_status: string;
  kpis: OperatorKPIs;
}
