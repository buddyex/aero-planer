import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  CreateMissionPayload,
  CreateSectorPayload,
  Drone,
  DroneModel,
  ManualWeatherPayload,
  Mission,
  Operator,
  OperationalOverview,
  Precipitation,
  RiskLevel,
  Sector,
  UpdateSectorBoundaryPayload,
  WeatherProvider,
  WeatherSource,
} from '../types';
import type { SectorRiskRow } from '../../shared/types/api.types';
import { countDronesByStatus, mapDroneRow } from '../utils/drones';
import { isDroneBlockedByFlightHours } from '../utils/maintenanceRules';
import {
  calculateRisk,
  formatDateTime,
  formatDisplayTime,
  normalizeDateTime,
} from '../utils/weather';
import { filterMissionsForUser } from '../utils/permissions';
import { restorePageInput } from '../utils/mapFocus';
import { useApi } from './ApiContext';
import { useAuth, useSocket } from './AuthContext';

interface DashboardStatsSnapshot extends OperationalOverview {}

const EMPTY_DASHBOARD_STATS: DashboardStatsSnapshot = {
  planned_missions: 0,
  pending_approvals: 0,
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

interface AppDataContextValue {
  drones: Drone[];
  droneModels: DroneModel[];
  operators: Operator[];
  sectors: Sector[];
  missions: Mission[];
  visibleMissions: Mission[];
  activeMissionsCount: number;
  dronesReadyCount: number;
  dronesInAirCount: number;
  dronesPlannedCount: number;
  dronesOnMaintenanceCount: number;
  dronesInRepairCount: number;
  operationalOverview: OperationalOverview;
  readyDrones: Drone[];
  availablePilots: Operator[];
  lastWeatherUpdate: string | null;
  weatherOfflineTimestamp: string | null;
  weatherSyncStatus: 'idle' | 'fresh' | 'cached' | 'error';
  weatherStatusMessage: string | null;
  isSyncingWeather: boolean;
  weatherSyncError: string | null;
  manualWeatherMode: boolean;
  lastWeatherSource: WeatherSource | null;
  hasBackend: boolean;
  getDroneById: (id: number) => Drone | undefined;
  getSectorById: (id: number) => Sector | undefined;
  getOperatorById: (id: number) => Operator | undefined;
  getModelById: (id: number) => DroneModel | undefined;
  getUpcomingMissions: () => Mission[];
  getSectorRiskDistribution: () => Record<RiskLevel, number>;
  syncWeatherFromApi: (provider: WeatherProvider) => Promise<void>;
  applyManualSectorCorrection: (payload: ManualWeatherPayload) => Promise<void>;
  createSector: (payload: CreateSectorPayload) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateSectorBoundary: (
    sectorId: number,
    payload: UpdateSectorBoundaryPayload,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  importSectorsKml: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
  exportSectorsKml: (sectorId?: number) => Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
  deleteSector: (sectorId: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  createMission: (
    payload: CreateMissionPayload,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateMission: (
    missionId: string,
    payload: CreateMissionPayload,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateMissionStatus: (
    missionId: string,
    status: Mission['status'],
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  approveMission: (missionId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  rejectMission: (missionId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  refreshAppData: () => Promise<void>;
  patchDrone: (drone: Drone) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);
const WEATHER_SYNC_STORAGE_KEY = 'aero-planer-last-weather-sync';

function toOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function mapSectorRows(rows: SectorRiskRow[]): Sector[] {
  return rows.map((row) => ({
    id: row.id,
    sector_name: row.sector_name,
    risk_level: row.risk_level as RiskLevel,
    center_lat: toOptionalNumber(row.center_lat ?? row.coordinates?.lat),
    center_lon: toOptionalNumber(row.center_lon ?? row.coordinates?.lon),
    radius_km: toOptionalNumber(row.radius_km) ?? 20,
    boundary_polygon: row.boundary_polygon ?? null,
    shape_type: row.shape_type === 'polygon' ? 'polygon' : 'circle',
    wind_speed: toOptionalNumber(row.wind_speed),
    temperature: toOptionalNumber(row.temperature),
    precipitation: row.precipitation as Precipitation | undefined,
    weather_source: row.weather_source as WeatherSource | undefined,
  }));
}

function formatSourcesLabel(sources?: string[]): string {
  if (!sources?.length) return 'каскад';
  return sources.join(', ');
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { user } = useAuth();
  const { socket } = useSocket();
  const operatorId = user?.id ?? null;
  const userRole = user?.role;
  const hasBackend = api.platform === 'http';

  const [drones, setDrones] = useState<Drone[]>([]);
  const [droneModels] = useState<DroneModel[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState<string | null>(null);
  const [weatherOfflineTimestamp, setWeatherOfflineTimestamp] = useState<string | null>(null);
  const [weatherSyncStatus, setWeatherSyncStatus] = useState<'idle' | 'fresh' | 'cached' | 'error'>('idle');
  const [weatherStatusMessage, setWeatherStatusMessage] = useState<string | null>(null);
  const [isSyncingWeather, setIsSyncingWeather] = useState(false);
  const [weatherSyncError, setWeatherSyncError] = useState<string | null>(null);
  const [manualWeatherMode, setManualWeatherMode] = useState(false);
  const [lastWeatherSource, setLastWeatherSource] = useState<WeatherSource | null>(null);
  const [dashboardStats, setDashboardStats] =
    useState<DashboardStatsSnapshot>(EMPTY_DASHBOARD_STATS);
  const weatherSyncInFlightRef = useRef(false);

  const refreshDashboardStatsFromDb = useCallback(async () => {
    const result = await api.getDashboardStats();
    if (result.ok && result.data) {
      const row = result.data as Record<string, unknown>;
      setDashboardStats({
        planned_missions: Number(row.planned_missions ?? 0),
        pending_approvals: Number(row.pending_approvals ?? 0),
        active_missions: Number(row.active_missions ?? 0),
        completed_missions: Number(row.completed_missions ?? 0),
        drones_ready: Number(row.drones_ready ?? 0),
        drones_in_air: Number(row.drones_in_air ?? row.drones_in_flight ?? 0),
        drones_planned: Number(row.drones_planned ?? 0),
        drones_on_maintenance: Number(row.drones_on_maintenance ?? 0),
        drones_in_repair: Number(row.drones_in_repair ?? 0),
        drones_in_diagnostics: Number(row.drones_in_diagnostics ?? 0),
        high_risk_sectors: Number(row.high_risk_sectors ?? 0),
        operators_in_mission: Number(row.operators_in_mission ?? 0),
      });
    }
  }, [api]);

  const refreshDronesFromDb = useCallback(async () => {
    const result = await api.getDrones();
    if (result.ok && result.data) {
      const rows = result.data as unknown as Array<Record<string, unknown>>;
      setDrones(rows.map(mapDroneRow));
    }
  }, [api]);

  const patchDrone = useCallback((drone: Drone) => {
    setDrones((prev) => {
      const index = prev.findIndex((item) => item.id === drone.id);
      if (index === -1) {
        return [drone, ...prev];
      }
      const next = [...prev];
      next[index] = drone;
      return next;
    });
  }, []);

  const refreshOperatorsFromDb = useCallback(async () => {
    const result = await api.getAllOperators();
    if (result.ok && result.data) {
      const rows = result.data as unknown as Array<Record<string, unknown>>;
      setOperators(
        rows.map((row) => ({
          id: Number(row.id),
          full_name: String(row.full_name),
          login: row.login ? String(row.login) : undefined,
          role: row.role as Operator['role'],
          duty_status: (row.duty_status as Operator['duty_status']) ?? 'Свободен',
        })),
      );
    }
  }, [api]);

  const refreshMissionsFromDb = useCallback(async () => {
    const result = await api.getMissions();
    if (result.ok && result.data) {
      const rows = result.data as Array<Record<string, unknown>>;
      setMissions(
        rows.map((row) => ({
          id: String(row.id),
          title: String(row.title),
          operator_id: Number(row.operator_id),
          drone_id: Number(row.drone_id),
          sector_id: Number(row.sector_id),
          start_time: normalizeDateTime(row.start_time),
          end_time: normalizeDateTime(row.end_time),
          status: row.status as Mission['status'],
          creator_id: row.creator_id != null ? String(row.creator_id) : null,
          creator_name: row.creator_name ? String(row.creator_name) : undefined,
          approved_by_id: row.approved_by_id != null ? String(row.approved_by_id) : null,
          approver_name: row.approver_name ? String(row.approver_name) : undefined,
          operator_name: row.operator_name ? String(row.operator_name) : undefined,
          drone_serial: row.drone_serial ? String(row.drone_serial) : undefined,
          drone_name: row.drone_name ? String(row.drone_name) : undefined,
          battery_id: row.battery_id ? String(row.battery_id) : undefined,
          battery_serial: row.battery_serial ? String(row.battery_serial) : undefined,
          battery_type: row.battery_type ? String(row.battery_type) : undefined,
          battery_capacity:
            row.battery_capacity != null ? Number(row.battery_capacity) : undefined,
          battery_cycle_count:
            row.battery_cycle_count != null ? Number(row.battery_cycle_count) : undefined,
          sector_name: row.sector_name ? String(row.sector_name) : undefined,
          sector_risk_level: row.sector_risk_level as Mission['sector_risk_level'],
        })),
      );
    }
  }, [api]);

  const refreshSectorsFromDb = useCallback(async () => {
    const result = await api.getSectorsRisk();
    if (result.ok && result.data) {
      setSectors(mapSectorRows(result.data));
    }
  }, [api]);

  const refreshAppData = useCallback(async () => {
    await Promise.all([
      refreshOperatorsFromDb(),
      refreshDronesFromDb(),
      refreshMissionsFromDb(),
      refreshSectorsFromDb(),
      refreshDashboardStatsFromDb(),
    ]);
  }, [
    api,
    refreshOperatorsFromDb,
    refreshDronesFromDb,
    refreshMissionsFromDb,
    refreshSectorsFromDb,
    refreshDashboardStatsFromDb,
  ]);

  const refreshDashboardFromDb = useCallback(async () => {
    await refreshAppData();
  }, [refreshAppData]);

  useEffect(() => {
    if (hasBackend) {
      refreshDashboardFromDb();
    }
  }, [hasBackend, refreshDashboardFromDb]);

  useEffect(() => {
    if (user && hasBackend) {
      void refreshAppData();
    }
  }, [user?.id, hasBackend, refreshAppData]);

  useEffect(() => {
    if (!socket || !hasBackend) return;

    const onMissionChange = () => {
      void refreshMissionsFromDb();
      void refreshDashboardStatsFromDb();
    };

    socket.on('mission:statusChanged', onMissionChange);
    socket.on('mission:created', onMissionChange);

    return () => {
      socket.off('mission:statusChanged', onMissionChange);
      socket.off('mission:created', onMissionChange);
    };
  }, [socket, hasBackend, refreshMissionsFromDb, refreshDashboardStatsFromDb]);

  const getDroneById = useCallback((id: number) => drones.find((d) => d.id === id), [drones]);
  const getSectorById = useCallback((id: number) => sectors.find((s) => s.id === id), [sectors]);
  const getOperatorById = useCallback(
    (id: number) => operators.find((o) => o.id === id),
    [operators],
  );
  const getModelById = useCallback(
    (id: number) => droneModels.find((m) => m.id === id),
    [droneModels],
  );

  const readyDrones = useMemo(
    () =>
      drones.filter(
        (d) => d.status === 'Готов' && !isDroneBlockedByFlightHours(d.flight_hours),
      ),
    [drones],
  );

  const dronesReadyCount = hasBackend
    ? dashboardStats.drones_ready
    : countDronesByStatus(drones, 'Готов');

  const dronesInAirCount = hasBackend
    ? dashboardStats.drones_in_air
    : countDronesByStatus(drones, 'В полете');

  const dronesPlannedCount = hasBackend
    ? dashboardStats.drones_planned
    : countDronesByStatus(drones, 'Запланирован');

  const dronesOnMaintenanceCount = hasBackend
    ? dashboardStats.drones_on_maintenance
    : countDronesByStatus(drones, 'На ТО');

  const dronesInRepairCount = hasBackend
    ? dashboardStats.drones_in_repair
    : countDronesByStatus(drones, 'Ремонт');

  const operationalOverview = useMemo<OperationalOverview>(() => {
    if (hasBackend) {
      return dashboardStats;
    }

    const plannedMissions = missions.filter((m) => m.status === 'К выполнению').length;
    const pendingApprovals = missions.filter((m) => m.status === 'Ожидает утверждения').length;
    const activeMissions = missions.filter((m) => m.status === 'Выполняется').length;
    const completedMissions = missions.filter((m) => m.status === 'Завершено').length;

    return {
      planned_missions: plannedMissions,
      pending_approvals: pendingApprovals,
      active_missions: activeMissions,
      completed_missions: completedMissions,
      drones_ready: countDronesByStatus(drones, 'Готов'),
      drones_in_air: countDronesByStatus(drones, 'В полете'),
      drones_planned: countDronesByStatus(drones, 'Запланирован'),
      drones_on_maintenance: countDronesByStatus(drones, 'На ТО'),
      drones_in_repair: countDronesByStatus(drones, 'Ремонт'),
      drones_in_diagnostics: countDronesByStatus(drones, 'Диагностика'),
      high_risk_sectors: sectors.filter((s) => s.risk_level === 'Высокий').length,
      operators_in_mission: operators.filter(
        (o) => o.role === 'Оператор' && o.duty_status === 'В миссии',
      ).length,
    };
  }, [hasBackend, dashboardStats, missions, drones, sectors, operators]);

  const availablePilots = useMemo(
    () =>
      operators.filter(
        (o) => o.role === 'Оператор' && (o.duty_status ?? 'Свободен') === 'Свободен',
      ),
    [operators],
  );

  const visibleMissions = useMemo(
    () => filterMissionsForUser(missions, userRole, operatorId),
    [missions, userRole, operatorId],
  );

  const activeMissionsCount = useMemo(
    () => visibleMissions.filter((m) => m.status === 'Выполняется').length,
    [visibleMissions],
  );

  const getUpcomingMissions = useCallback(
    () =>
      visibleMissions
        .filter((m) => m.status === 'К выполнению')
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [visibleMissions],
  );

  const getSectorRiskDistribution = useCallback(() => {
    const dist: Record<RiskLevel, number> = { Низкий: 0, Средний: 0, Высокий: 0 };
    sectors.forEach((s) => {
      dist[s.risk_level] += 1;
    });
    return dist;
  }, [sectors]);

  const syncWeatherFromApi = useCallback(
    async (_provider: WeatherProvider) => {
      if (weatherSyncInFlightRef.current) return;

      weatherSyncInFlightRef.current = true;
      setIsSyncingWeather(true);
      setWeatherSyncError(null);
      setWeatherStatusMessage(null);
      setWeatherOfflineTimestamp(null);
      setManualWeatherMode(false);

      try {
        if (!hasBackend) {
          setWeatherSyncStatus('idle');
          setWeatherStatusMessage('Синхронизация отправлена в очередь сервера.');
          setWeatherSyncError(null);
          return;
        }

        const result = await api.syncAllSectorsWeather();

        if (!result.ok) {
          if (result.error === 'OFFLINE_WEATHER') {
            setManualWeatherMode(true);
            setWeatherSyncStatus('error');
            const offlineMessage =
              result.message ??
              'Все погодные API недоступны. Введите данные вручную для допуска к полётам.';
            setWeatherSyncError(offlineMessage);
            setWeatherStatusMessage(offlineMessage);
            return;
          }

          setWeatherSyncStatus('error');
          setWeatherSyncError(result.message ?? 'Ошибка синхронизации метеоданных.');
          setWeatherStatusMessage(result.message ?? null);
          return;
        }

        await refreshSectorsFromDb();
        setLastWeatherUpdate(result.syncedAt ?? formatDateTime(new Date()));

        if (result.sourcesUsed?.length === 1) {
          setLastWeatherSource(result.sourcesUsed[0] as WeatherSource);
        } else if (result.sourcesUsed && result.sourcesUsed.length > 1) {
          setLastWeatherSource(null);
        }

        if (result.isCached) {
          setWeatherSyncStatus('cached');
          setWeatherOfflineTimestamp(result.cachedAt ?? null);
          const cachedLabel = result.cachedAt
            ? `Данные из БД от ${formatDisplayTime(result.cachedAt)}.`
            : 'Данные взяты из локального кэша.';
          const detail = result.failureReason
            ? `${result.failureReason} ${cachedLabel}`
            : `Погодные API недоступны. ${cachedLabel}`;
          setWeatherStatusMessage(detail);
          setWeatherSyncError(detail);
          setManualWeatherMode(true);
        } else {
          setWeatherSyncStatus('fresh');
          setWeatherOfflineTimestamp(null);
          const syncedResults = Array.isArray(result.data)
            ? result.data.filter((entry) => entry && typeof entry === 'object' && entry.ok)
            : [];
          const count =
            result.freshCount ??
            result.totalSectors ??
            (syncedResults.length > 0 ? syncedResults.length : undefined);
          const sourceLabel = formatSourcesLabel(result.sourcesUsed);
          const countLabel = count != null ? String(count) : 'все';
          const successMessage = `Метеоданные обновлены (${countLabel} секторов, источник: ${sourceLabel}).`;
          setWeatherStatusMessage(successMessage);
          setWeatherSyncError(null);
        }

        sessionStorage.setItem(WEATHER_SYNC_STORAGE_KEY, String(Date.now()));
      } catch (error) {
        console.error('[AppDataContext] syncWeatherFromApi:', error);
        setWeatherSyncStatus('error');
        const message = 'Синхронизация прервана. Проверьте подключение к сети.';
        setWeatherSyncError(message);
        setWeatherStatusMessage(message);
      } finally {
        weatherSyncInFlightRef.current = false;
        setIsSyncingWeather(false);
      }
    },
    [api, hasBackend, refreshSectorsFromDb],
  );

  const createSector = useCallback(
    async (payload: CreateSectorPayload): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (api.platform === 'http') {
        const result = await api.createSector(
          payload.sector_name,
          payload.center_lat,
          payload.center_lon,
          payload.radius_km ?? 20,
          {
            shapeType: payload.shape_type,
            boundaryPolygon: payload.boundary_polygon,
          },
        );
        if (result.ok) {
          await refreshSectorsFromDb();

          const sector = result.data as
            | { id: number; center_lat: number; center_lon: number }
            | undefined;
          if (sector?.id != null && sector.center_lat != null && sector.center_lon != null) {
            void api
              .syncWeather(sector.id, sector.center_lat, sector.center_lon)
              .then(() => refreshSectorsFromDb())
              .catch((error) => {
                console.error('[AppDataContext] createSector weather sync:', error);
              });
          }

          return { ok: true };
        }
        return { ok: false, error: result.message ?? 'Не удалось создать сектор.' };
      }

      const nextId = Math.max(0, ...sectors.map((sector) => sector.id)) + 1;
      setSectors((prev) => [
        ...prev,
        {
          id: nextId,
          sector_name: payload.sector_name,
          risk_level: 'Низкий',
          center_lat: payload.center_lat,
          center_lon: payload.center_lon,
          radius_km: payload.radius_km ?? 20,
        },
      ]);
      return { ok: true };
    },
    [refreshSectorsFromDb, sectors],
  );

  const updateSectorBoundary = useCallback(
    async (
      sectorId: number,
      payload: UpdateSectorBoundaryPayload,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (api.platform === 'http') {
        const boundaryPolygon =
          typeof payload.boundary_polygon === 'string'
            ? payload.boundary_polygon
            : JSON.stringify(payload.boundary_polygon ?? []);

        const result = await api.updateSectorBoundary(sectorId, {
          ...payload,
          boundary_polygon: boundaryPolygon,
        });
        if (result.ok) {
          await refreshSectorsFromDb();
          return { ok: true };
        }
        return { ok: false, error: result.message ?? 'Не удалось обновить границы сектора.' };
      }

      setSectors((prev) =>
        prev.map((sector) =>
          sector.id === sectorId
            ? {
                ...sector,
                shape_type: payload.shape_type,
                center_lat: payload.center_lat ?? sector.center_lat,
                center_lon: payload.center_lon ?? sector.center_lon,
                radius_km: payload.radius_km ?? sector.radius_km,
                boundary_polygon:
                  typeof payload.boundary_polygon === 'string'
                    ? payload.boundary_polygon
                    : JSON.stringify(payload.boundary_polygon ?? []),
              }
            : sector,
        ),
      );
      return { ok: true };
    },
    [refreshSectorsFromDb],
  );

  const importSectorsKml = useCallback(async (): Promise<
    { ok: true; message?: string } | { ok: false; error: string }
  > => {
    if (!hasBackend) {
      return { ok: false, error: 'Сервер недоступен. Проверьте подключение.' };
    }
    const result = await api.importSectorsKml();
    if (result.ok) {
      await refreshSectorsFromDb();
      const importedCount = (result.data as { importedCount?: number } | undefined)?.importedCount;
      return {
        ok: true,
        message:
          importedCount != null
            ? `Импортировано секторов: ${importedCount}.`
            : result.message,
      };
    }
    if (result.error === 'CANCELLED') {
      return { ok: false, error: 'Импорт отменён.' };
    }
    return { ok: false, error: result.message ?? result.error ?? 'Ошибка импорта KML.' };
  }, [api, hasBackend, refreshSectorsFromDb]);

  const exportSectorsKml = useCallback(async (
    sectorId?: number,
  ): Promise<{ ok: true; message?: string } | { ok: false; error: string }> => {
    if (!hasBackend) {
      return { ok: false, error: 'Сервер недоступен. Проверьте подключение.' };
    }
    const result = await api.exportSectorsKml(sectorId);
    if (result.ok) {
      const message =
        sectorId != null && result.sectorName
          ? `Сектор «${result.sectorName}» экспортирован в KML.`
          : `Экспортировано секторов: ${result.count ?? 0}.`;
      return { ok: true, message };
    }
    if (result.error === 'CANCELLED') {
      return { ok: false, error: 'Экспорт отменён.' };
    }
    return { ok: false, error: result.message ?? result.error ?? 'Ошибка экспорта KML.' };
  }, [api, hasBackend]);

  const deleteSector = useCallback(
    async (sectorId: number): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (api.platform === 'http') {
        const result = await api.deleteSector(sectorId);
        if (result.ok) {
          await refreshSectorsFromDb();
          restorePageInput();
          return { ok: true };
        }
        return { ok: false, error: result.message ?? 'Не удалось удалить сектор.' };
      }

      setSectors((prev) => prev.filter((sector) => sector.id !== sectorId));
      restorePageInput();
      return { ok: true };
    },
    [refreshSectorsFromDb],
  );

  const applyManualSectorCorrection = useCallback(
    async (payload: ManualWeatherPayload) => {
      if (api.platform === 'http') {
        const result = await api.insertManualWeather(
          payload.sector_id,
          payload.wind_speed,
          payload.temperature,
          payload.precipitation,
        );

        if (result.ok) {
          await refreshSectorsFromDb();
          setLastWeatherUpdate(formatDateTime(new Date()));
          setWeatherOfflineTimestamp(null);
          setManualWeatherMode(false);
          setLastWeatherSource('Manual');
          setWeatherSyncStatus('fresh');
        }
        return;
      }

      setSectors((prev) =>
        prev.map((sector) =>
          sector.id === payload.sector_id
            ? {
                ...sector,
                wind_speed: payload.wind_speed,
                temperature: payload.temperature,
                precipitation: payload.precipitation,
                risk_level: calculateRisk(
                  payload.wind_speed,
                  payload.temperature,
                  payload.precipitation,
                ),
              }
            : sector,
        ),
      );
      setLastWeatherUpdate(formatDateTime(new Date()));
    },
    [refreshSectorsFromDb],
  );

  const createMission = useCallback(
    async (
      payload: CreateMissionPayload,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (api.platform === 'http') {
        const result = await api.createMission(payload);
        if (result.ok) {
          await Promise.all([
            refreshMissionsFromDb(),
            refreshDronesFromDb(),
            refreshOperatorsFromDb(),
            refreshDashboardStatsFromDb(),
          ]);
          return { ok: true };
        }
        return { ok: false, error: result.error ?? 'Не удалось создать миссию.' };
      }

      const drone = drones.find((d) => d.id === payload.drone_id);
      if (!drone) return { ok: false, error: 'Борт БПЛА не найден.' };
      if (drone.status !== 'Готов') {
        return {
          ok: false,
          error: `Борт ${drone.serial_number} недоступен (статус: ${drone.status}).`,
        };
      }

      const pilot = operators.find((o) => o.id === payload.operator_id);
      if (pilot?.role === 'Оператор' && (pilot.duty_status ?? 'Свободен') !== 'Свободен') {
        return { ok: false, error: 'Оператор уже назначен на другую миссию.' };
      }

      const hasOverlap = missions.some(
        (m) =>
          (m.status === 'К выполнению' || m.status === 'Выполняется') &&
          payload.start_time < m.end_time &&
          payload.end_time > m.start_time &&
          (m.drone_id === payload.drone_id || m.operator_id === payload.operator_id),
      );
      if (hasOverlap) {
        return {
          ok: false,
          error: 'Борт или оператор уже заняты другой миссией в это время.',
        };
      }

      if (payload.start_time >= payload.end_time) {
        return { ok: false, error: 'Время окончания должно быть позже времени начала.' };
      }

      const newMission: Mission = {
        id: crypto.randomUUID(),
        ...payload,
        status: 'К выполнению',
      };
      setMissions((prev) => [...prev, newMission]);
      setDrones((prev) =>
        prev.map((d) => (d.id === payload.drone_id ? { ...d, status: 'Запланирован' } : d)),
      );
      setOperators((prev) =>
        prev.map((o) =>
          o.id === payload.operator_id ? { ...o, duty_status: 'Запланирован' } : o,
        ),
      );
      return { ok: true };
    },
    [drones, missions, operators, refreshMissionsFromDb, refreshDronesFromDb, refreshOperatorsFromDb, refreshDashboardStatsFromDb],
  );

  const updateMission = useCallback(
    async (
      missionId: string,
      payload: CreateMissionPayload,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (api.platform === 'http') {
        const result = await api.updateMission(missionId, payload);
        if (result.ok) {
          await Promise.all([
            refreshMissionsFromDb(),
            refreshDronesFromDb(),
            refreshOperatorsFromDb(),
            refreshDashboardStatsFromDb(),
          ]);
          return { ok: true };
        }
        return { ok: false, error: result.error ?? 'Не удалось обновить миссию.' };
      }

      const mission = missions.find((m) => m.id === missionId);
      if (!mission) return { ok: false, error: 'Миссия не найдена.' };
      if (mission.status !== 'К выполнению' && mission.status !== 'Ожидает утверждения') {
        return { ok: false, error: 'Редактировать можно только миссию до запуска.' };
      }

      if (payload.start_time >= payload.end_time) {
        return { ok: false, error: 'Время окончания должно быть позже времени начала.' };
      }

      setMissions((prev) =>
        prev.map((m) =>
          m.id === missionId
            ? {
                ...m,
                ...payload,
              }
            : m,
        ),
      );

      if (mission.drone_id !== payload.drone_id) {
        setDrones((prev) =>
          prev.map((d) => {
            if (d.id === mission.drone_id) return { ...d, status: 'Готов' };
            if (d.id === payload.drone_id) return { ...d, status: 'Запланирован' };
            return d;
          }),
        );
      }

      if (mission.operator_id !== payload.operator_id) {
        setOperators((prev) =>
          prev.map((o) => {
            if (o.id === mission.operator_id) return { ...o, duty_status: 'Свободен' };
            if (o.id === payload.operator_id) return { ...o, duty_status: 'Запланирован' };
            return o;
          }),
        );
      }

      return { ok: true };
    },
    [api, missions, refreshMissionsFromDb, refreshDronesFromDb, refreshOperatorsFromDb, refreshDashboardStatsFromDb],
  );

  const approveMission = useCallback(
    async (missionId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (api.platform === 'http') {
        const result = await api.approveMission(missionId);
        if (result.ok) {
          await Promise.all([
            refreshMissionsFromDb(),
            refreshDronesFromDb(),
            refreshOperatorsFromDb(),
            refreshDashboardStatsFromDb(),
          ]);
          return { ok: true };
        }
        return { ok: false, error: result.error ?? 'Не удалось утвердить миссию.' };
      }
      setMissions((prev) =>
        prev.map((m) =>
          m.id === missionId ? { ...m, status: 'К выполнению' as const } : m,
        ),
      );
      return { ok: true };
    },
    [api, refreshMissionsFromDb, refreshDronesFromDb, refreshOperatorsFromDb, refreshDashboardStatsFromDb],
  );

  const rejectMission = useCallback(
    async (missionId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (api.platform === 'http') {
        const result = await api.rejectMission(missionId);
        if (result.ok) {
          await refreshMissionsFromDb();
          await refreshDashboardStatsFromDb();
          return { ok: true };
        }
        return { ok: false, error: result.error ?? 'Не удалось отклонить миссию.' };
      }
      setMissions((prev) =>
        prev.map((m) =>
          m.id === missionId ? { ...m, status: 'Отклонено' as const } : m,
        ),
      );
      return { ok: true };
    },
    [api, refreshMissionsFromDb, refreshDashboardStatsFromDb],
  );

  const updateMissionStatus = useCallback(
    async (
      missionId: string,
      status: Mission['status'],
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (api.platform === 'http') {
        const result = await api.updateMissionStatus(missionId, status);
        if (result.ok) {
          await Promise.all([
            refreshMissionsFromDb(),
            refreshDronesFromDb(),
            refreshOperatorsFromDb(),
            refreshDashboardStatsFromDb(),
          ]);
          return { ok: true };
        }
        return { ok: false, error: result.error ?? result.message ?? 'Не удалось обновить статус миссии.' };
      }

      const mission = missions.find((m) => m.id === missionId);
      if (!mission) return { ok: false, error: 'Миссия не найдена.' };

      setMissions((prev) =>
        prev.map((m) => (m.id === missionId ? { ...m, status } : m)),
      );
      if (status === 'Выполняется') {
        setDrones((prev) =>
          prev.map((d) => (d.id === mission.drone_id ? { ...d, status: 'В полете' } : d)),
        );
        setOperators((prev) =>
          prev.map((o) =>
            o.id === mission.operator_id ? { ...o, duty_status: 'В миссии' } : o,
          ),
        );
      } else if (status === 'Завершено' || status === 'Отменено') {
        setDrones((prev) =>
          prev.map((d) =>
            d.id === mission.drone_id && (d.status === 'В полете' || d.status === 'Запланирован')
              ? { ...d, status: 'Готов' }
              : d,
          ),
        );
        setOperators((prev) =>
          prev.map((o) =>
            o.id === mission.operator_id ? { ...o, duty_status: 'Свободен' } : o,
          ),
        );
      }
      return { ok: true };
    },
    [api, missions, refreshMissionsFromDb, refreshDronesFromDb, refreshOperatorsFromDb, refreshDashboardStatsFromDb],
  );

  const value = useMemo(
    () => ({
      drones,
      droneModels,
      operators,
      sectors,
      missions,
      visibleMissions,
      activeMissionsCount,
      dronesReadyCount,
      dronesInAirCount,
      dronesPlannedCount,
      dronesOnMaintenanceCount,
      dronesInRepairCount,
      operationalOverview,
      readyDrones,
      availablePilots,
      lastWeatherUpdate,
      weatherOfflineTimestamp,
      weatherSyncStatus,
      weatherStatusMessage,
      isSyncingWeather,
      weatherSyncError,
      manualWeatherMode,
      lastWeatherSource,
      hasBackend,
      getDroneById,
      getSectorById,
      getOperatorById,
      getModelById,
      getUpcomingMissions,
      getSectorRiskDistribution,
      syncWeatherFromApi,
      applyManualSectorCorrection,
      createSector,
      updateSectorBoundary,
      importSectorsKml,
      exportSectorsKml,
      deleteSector,
      createMission,
      updateMission,
      updateMissionStatus,
      approveMission,
      rejectMission,
      refreshAppData,
      patchDrone,
    }),
    [
      drones,
      droneModels,
      operators,
      sectors,
      missions,
      visibleMissions,
      activeMissionsCount,
      dronesReadyCount,
      dronesInAirCount,
      dronesPlannedCount,
      dronesOnMaintenanceCount,
      dronesInRepairCount,
      operationalOverview,
      readyDrones,
      availablePilots,
      lastWeatherUpdate,
      weatherOfflineTimestamp,
      weatherSyncStatus,
      weatherStatusMessage,
      isSyncingWeather,
      weatherSyncError,
      manualWeatherMode,
      lastWeatherSource,
      hasBackend,
      getDroneById,
      getSectorById,
      getOperatorById,
      getModelById,
      getUpcomingMissions,
      getSectorRiskDistribution,
      syncWeatherFromApi,
      applyManualSectorCorrection,
      createSector,
      updateSectorBoundary,
      importSectorsKml,
      exportSectorsKml,
      deleteSector,
      createMission,
      updateMission,
      updateMissionStatus,
      approveMission,
      rejectMission,
      refreshAppData,
      patchDrone,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
