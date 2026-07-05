export type DroneStatus = 'Готов' | 'Запланирован' | 'На ТО' | 'Ремонт' | 'Диагностика' | 'В полете';
export type OperatorRole = 'Администратор' | 'Руководитель' | 'Техник' | 'Оператор';

export const OPERATOR_ROLES: OperatorRole[] = [
  'Администратор',
  'Руководитель',
  'Оператор',
  'Техник',
];
export type OperatorDutyStatus = 'Свободен' | 'Запланирован' | 'В миссии';
export type RiskLevel = 'Низкий' | 'Средний' | 'Высокий';
export type MissionStatus =
  | 'Ожидает утверждения'
  | 'К выполнению'
  | 'Выполняется'
  | 'Завершено'
  | 'Отменено'
  | 'Отклонено';
export type Precipitation = 'Ясно' | 'Дождь' | 'Снег' | 'Туман';
export type WeatherProvider = 'checkwx' | 'noaa' | 'open-meteo' | 'manual' | 'cascade';
export type WeatherSource = 'CheckWX' | 'NOAA' | 'OpenMeteo' | 'Manual';

export interface DroneModel {
  id: number;
  model_name: string;
  max_wind_speed: number;
  min_temp: number;
  max_temp: number;
  requires_clear_sky: 0 | 1;
}

export interface Drone {
  id: number;
  name: string;
  serial_number: string;
  max_wind_speed: number;
  battery_capacity: number;
  payload_capacity: number;
  flight_time_max: number;
  flight_hours?: number;
  status: DroneStatus;
}

export interface DronePayload {
  name: string;
  serial_number: string;
  max_wind_speed: number;
  battery_capacity: number;
  payload_capacity: number;
  flight_time_max: number;
  status?: DroneStatus;
}

export interface Operator {
  id: number;
  full_name: string;
  login?: string;
  role: OperatorRole;
  duty_status?: OperatorDutyStatus;
}

export interface AuthUser {
  id: number;
  full_name: string;
  login: string;
  role: OperatorRole;
}

export interface AuditLogEntry {
  id: number;
  operator_id: number | null;
  action_text: string;
  timestamp: string;
}

export interface OperationalOverview {
  planned_missions: number;
  pending_approvals?: number;
  active_missions: number;
  completed_missions: number;
  drones_ready: number;
  drones_in_air: number;
  drones_planned: number;
  drones_on_maintenance: number;
  drones_in_repair: number;
  drones_in_diagnostics: number;
  high_risk_sectors: number;
  operators_in_mission: number;
}

export interface TechnicianKPIs {
  maintenance_records: number;
  open_maintenance_sessions: number;
  battery_inspections: number;
  batteries_pending_inspection: number;
}

export interface PilotKPIs {
  planned_missions: number;
  active_missions: number;
  completed_missions: number;
  total_actions: number;
}

export type OperatorKPIs = OperationalOverview | TechnicianKPIs | PilotKPIs;

export interface OperatorProfile {
  id: number;
  full_name: string;
  login: string;
  role: OperatorRole;
  duty_status: string;
  kpis: OperatorKPIs;
}

export interface MaintenanceLog {
  id: number;
  drone_id: number;
  operator_id: number;
  maintenance_date: string;
  work_type: string;
  description?: string | null;
  drone_name?: string;
  drone_serial?: string;
  drone_status?: string;
  drone_flight_hours?: number;
  hours_at_service?: number | null;
  closed_at?: string | null;
  operator_name?: string;
}

export interface CreateOperatorPayload {
  full_name: string;
  login: string;
  pin_code: string;
  role: OperatorRole;
}

export type SectorShapeType = 'circle' | 'polygon';

export interface Sector {
  id: number;
  sector_name: string;
  risk_level: RiskLevel;
  center_lat?: number;
  center_lon?: number;
  radius_km?: number;
  boundary_polygon?: string | null;
  shape_type?: SectorShapeType;
  wind_speed?: number;
  temperature?: number;
  precipitation?: Precipitation;
  weather_source?: WeatherSource;
}

export interface CreateSectorPayload {
  sector_name: string;
  center_lat: number;
  center_lon: number;
  radius_km?: number;
  shape_type?: SectorShapeType;
  boundary_polygon?: string;
}

export interface UpdateSectorBoundaryPayload {
  shape_type: SectorShapeType;
  center_lat?: number;
  center_lon?: number;
  radius_km?: number;
  boundary_polygon?: string | [number, number][];
}

export interface Mission {
  id: string;
  title: string;
  operator_id: number;
  drone_id: number;
  battery_id?: string;
  sector_id: number;
  start_time: string;
  end_time: string;
  status: MissionStatus;
  creator_id?: string | null;
  approved_by_id?: string | null;
  route_geometry?: string | null;
  creator_name?: string;
  approver_name?: string;
  operator_name?: string;
  drone_serial?: string;
  drone_name?: string;
  battery_serial?: string;
  battery_type?: string;
  battery_capacity?: number;
  battery_cycle_count?: number;
  sector_name?: string;
  sector_risk_level?: RiskLevel;
  flight_radius_m?: number;
  flight_altitude_m?: number;
}

export interface Battery {
  id: string;
  serial_number: string;
  type: string;
  capacity: number;
  cycle_count: number;
  status: 'Отлично' | 'Требуется проверка' | 'Списано';
}

export interface BatteryInspectionLog {
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

export interface CreateMissionPayload {
  title: string;
  operator_id: number;
  drone_id: number;
  battery_id: string;
  sector_id: number;
  start_time: string;
  end_time: string;
  flight_radius_m?: number;
  flight_altitude_m?: number;
  route_geometry?: string | null;
}

export interface ManualWeatherPayload {
  sector_id: number;
  wind_speed: number;
  temperature: number;
  precipitation: Precipitation;
}

export type ThemeMode = 'dark' | 'light';

export const WEATHER_PROVIDERS: { id: WeatherProvider; label: string }[] = [
  { id: 'cascade', label: 'Каскад (CheckWX → NOAA → OpenMeteo)' },
  { id: 'checkwx', label: 'CheckWX API' },
  { id: 'noaa', label: 'NOAA AviationWeather' },
  { id: 'open-meteo', label: 'Open-Meteo API' },
  { id: 'manual', label: 'Ручной ввод' },
];

export const PRECIPITATION_OPTIONS: Precipitation[] = ['Ясно', 'Дождь', 'Снег', 'Туман'];
