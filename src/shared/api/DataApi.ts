import type {
  ApiResult,
  AuditLogFilters,
  AuditLogPage,
  AuthUserRow,
  BatteryInspectionLogRow,
  BatteryInspectionPayload,
  BatteryRow,
  ChatContactRow,
  DroneInput,
  DroneRow,
  IntegrityReport,
  MessageRow,
  OperatorProfileRow,
  RendererErrorPayload,
  SectorRiskRow,
  SystemErrorFilters,
  SystemErrorLogEntry,
  SystemErrorStats,
  SystemOverviewData,
  UnreadMessageRow,
  WeatherResult,
} from '../types/api.types';

/** Контракт доступа к данным через HTTP REST + WebSocket. */
export interface DataApi {
  readonly platform: 'http';

  loginOperator: (login: string, pin: string) => Promise<ApiResult<AuthUserRow>>;
  logoutOperator: () => Promise<ApiResult>;
  validateSession: () => Promise<ApiResult<AuthUserRow>>;
  getOperatorKPIs: () => Promise<ApiResult>;
  getOperatorProfile: (operatorId: number) => Promise<ApiResult<OperatorProfileRow>>;
  getAuditLogs: (limit?: number, sinceTimestamp?: string) => Promise<ApiResult>;

  getAllOperators: () => Promise<ApiResult<AuthUserRow[]>>;
  createOperator: (payload: {
    full_name: string;
    login: string;
    pin_code: string;
    role: string;
  }) => Promise<ApiResult<AuthUserRow>>;
  updateOperator: (
    operatorId: number,
    payload: Partial<{
      full_name: string;
      login: string;
      pin_code: string;
      role: string;
    }>,
  ) => Promise<ApiResult<AuthUserRow>>;
  deleteOperator: (operatorId: number) => Promise<ApiResult & { deletedId?: number }>;

  getUsersForChat: (searchQuery?: string) => Promise<ApiResult<ChatContactRow[]>>;
  sendMessage: (
    senderId: number,
    receiverId: number,
    text: string,
  ) => Promise<ApiResult<MessageRow>>;
  getDialogMessages: (
    user1Id: number,
    user2Id: number,
  ) => Promise<ApiResult<MessageRow[]>>;
  getUnreadMessages: () => Promise<ApiResult<UnreadMessageRow[]>>;
  markDialogAsRead: (peerId: number) => Promise<ApiResult<{ marked?: number }>>;

  getMaintenanceLogs: () => Promise<ApiResult>;
  addMaintenanceLog: (payload: {
    drone_id: number;
    work_type: string;
    description?: string;
    maintenance_date?: string;
  }) => Promise<ApiResult>;

  getDashboardStats: () => Promise<ApiResult>;
  getMissions: () => Promise<ApiResult>;
  createMission: (payload: {
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
  }) => Promise<ApiResult>;
  updateMission: (
    missionId: string,
    payload: {
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
    },
  ) => Promise<ApiResult>;
  updateMissionStatus: (missionId: string, status: string) => Promise<ApiResult>;
  approveMission: (missionId: string) => Promise<ApiResult>;
  rejectMission: (missionId: string) => Promise<ApiResult>;
  exportMissionKml: (missionId: string) => Promise<ApiResult & { missionTitle?: string; sectorName?: string }>;
  downloadMapTiles: (
    bbox: { south: number; west: number; north: number; east: number },
    minZoom?: number,
    maxZoom?: number,
  ) => Promise<ApiResult & { jobId?: string; total?: number }>;
  getMapCacheStats: () => Promise<ApiResult & { tileCount?: number; sizeBytes?: number }>;
  onMapCacheProgress: (
    callback: (payload: {
      jobId?: string;
      done?: number;
      total?: number;
      percent?: number;
      status?: string;
      downloaded?: number;
      failed?: number;
      message?: string;
    }) => void,
  ) => () => void;
  getAvailableBatteries: () => Promise<ApiResult<BatteryRow[]> & { pendingInspectionCount?: number }>;
  getAllBatteries: () => Promise<ApiResult<BatteryRow[]>>;
  addBattery: (
    serial_number: string,
    type: string,
    capacity: number,
  ) => Promise<ApiResult<BatteryRow>>;
  updateBatteryStatus: (batteryId: string, status: string) => Promise<ApiResult<BatteryRow>>;
  getBatteryInspectionLogs: () => Promise<ApiResult<BatteryInspectionLogRow[]>>;
  completeBatteryInspection: (
    batteryId: string,
    payload: BatteryInspectionPayload,
  ) => Promise<ApiResult<BatteryRow>>;
  getSectorsRisk: () => Promise<ApiResult<SectorRiskRow[]>>;
  getWeather: (lat: number, lon: number) => Promise<WeatherResult>;
  createSector: (
    sectorName: string,
    centerLat: number,
    centerLon: number,
    radiusKm?: number,
    options?: { shapeType?: string; boundaryPolygon?: string | unknown },
  ) => Promise<ApiResult>;
  deleteSector: (sectorId: number) => Promise<ApiResult>;
  updateSectorBoundary: (
    sectorId: number,
    payload: {
      shape_type: 'circle' | 'polygon';
      center_lat?: number;
      center_lon?: number;
      radius_km?: number;
      boundary_polygon?: string | [number, number][];
    },
  ) => Promise<ApiResult>;
  importSectorsKml: () => Promise<ApiResult & { imported?: unknown[]; errors?: string[] }>;
  exportSectorsKml: (sectorId?: number) => Promise<ApiResult & { count?: number; sectorName?: string }>;
  syncWeather: (sectorId: number, lat: number, lon: number) => Promise<ApiResult>;
  syncAllSectorsWeather: () => Promise<
    ApiResult & {
      syncedAt?: string;
      isCached?: boolean;
      cachedAt?: string | null;
      failureReason?: string | null;
      freshCount?: number;
      cachedCount?: number;
      totalSectors?: number;
      source?: string;
      sourcesUsed?: string[];
      attemptedSources?: string[];
    }
  >;
  insertManualWeather: (
    sectorId: number,
    windSpeed: number,
    temperature: number,
    precipitation: string,
  ) => Promise<ApiResult>;
  getDrones: () => Promise<ApiResult<DroneRow[]>>;
  addDrone: (drone: DroneInput) => Promise<ApiResult<DroneRow>>;
  updateDrone: (id: number, drone: DroneInput) => Promise<ApiResult<DroneRow>>;
  deleteDrone: (id: number) => Promise<ApiResult & { deletedId?: number }>;
  saveFlightSheetPdf: (
    defaultFilename: string,
    pdfDataBase64: string,
  ) => Promise<ApiResult & { filePath?: string }>;
  downloadFlightSheetPdf?: (missionId: string) => Promise<{ ok: boolean; error?: string; status?: string }>;
  getSystemOverview: () => Promise<ApiResult<SystemOverviewData>>;
  getAuditLogsPage: (filters?: AuditLogFilters) => Promise<ApiResult<AuditLogPage>>;
  getIntegrityReport: () => Promise<ApiResult<IntegrityReport>>;
  getSystemErrorLogs: (filters?: SystemErrorFilters) => Promise<ApiResult<SystemErrorLogEntry[]>>;
  getSystemErrorStats: (filters?: SystemErrorFilters) => Promise<ApiResult<SystemErrorStats>>;
  reportRendererError: (payload: RendererErrorPayload) => Promise<ApiResult<{ id: string }>>;
  completeMaintenance: (droneId: number) => Promise<ApiResult<DroneRow>>;
}
