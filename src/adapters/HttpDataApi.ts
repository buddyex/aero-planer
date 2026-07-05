import axios, { type AxiosInstance } from 'axios';
import type { DataApi } from '../shared/api/DataApi';
import type { ApiResult, AuthUserRow } from '../shared/types/api.types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'aero-planer-access-token';

function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export class HttpDataApi {
  readonly platform = 'http' as const;

  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE,
      withCredentials: true,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use((config) => {
      const token = getStoredToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  getAccessToken(): string | null {
    return getStoredToken();
  }

  private wrap<T>(promise: Promise<{ data: Record<string, unknown> }>): Promise<ApiResult<T>> {
    return promise
      .then((res) => {
        const body = res.data;
        if (body.ok === false) {
          return { ok: false, error: String(body.error ?? body.message ?? 'Ошибка запроса'), message: body.message as string | undefined };
        }
        return { ok: true, data: body.data as T, ...(body as Record<string, unknown>) } as ApiResult<T>;
      })
      .catch((err) => ({
        ok: false as const,
        error: err.response?.data?.message ?? err.response?.data?.error ?? err.message ?? 'Сеть недоступна',
      }));
  }

  async loginOperator(login: string, pin: string) {
    try {
      const res = await this.client.post<{ ok: boolean; data?: unknown; access_token?: string; message?: string; error?: string }>(
        '/auth/login',
        { login, pin },
        { validateStatus: (status) => status < 500 },
      );
      if (!res.data.ok || !res.data.data || !res.data.access_token) {
        return {
          ok: false as const,
          error: res.data.error ?? res.data.message ?? 'Неверный логин или PIN-код.',
        };
      }
      setStoredToken(res.data.access_token);
      return { ok: true as const, data: res.data.data as AuthUserRow };
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
      return {
        ok: false as const,
        error:
          ax.response?.data?.error ??
          ax.response?.data?.message ??
          ax.message ??
          'Сеть недоступна. Проверьте, что backend запущен (npm run dev:full).',
      };
    }
  }

  async logoutOperator() {
    setStoredToken(null);
    return this.wrap(this.client.post('/auth/logout'));
  }

  async validateSession() {
    return this.wrap(this.client.get('/auth/session'));
  }

  getOperatorKPIs() {
    return this.wrap(this.client.get('/operators/kpis'));
  }

  getOperatorProfile(operatorId: number) {
    return this.wrap(this.client.get(`/operators/profile/${operatorId}`));
  }

  getAuditLogs(limit?: number, sinceTimestamp?: string) {
    return this.wrap(
      this.client.get('/audit-logs', { params: { limit, since: sinceTimestamp } }),
    );
  }

  getAllOperators() {
    return this.wrap(this.client.get('/operators'));
  }

  createOperator(payload: Parameters<DataApi['createOperator']>[0]) {
    return this.wrap(this.client.post('/operators', { ...payload, pin: payload.pin_code }));
  }

  updateOperator(operatorId: number, payload: Parameters<DataApi['updateOperator']>[1]) {
    return this.wrap(
      this.client.put(`/operators/${operatorId}`, {
        ...payload,
        pin: payload.pin_code,
      }),
    );
  }

  deleteOperator(operatorId: number) {
    return this.wrap(this.client.delete(`/operators/${operatorId}`));
  }

  getUsersForChat(searchQuery?: string) {
    return this.wrap(this.client.get('/messages/users', { params: { q: searchQuery } }));
  }

  sendMessage(senderId: number, receiverId: number, text: string) {
    return this.wrap(this.client.post('/messages', { senderId, receiverId, text }));
  }

  getDialogMessages(_user1Id: number, user2Id: number) {
    return this.wrap(this.client.get(`/messages/dialog/${user2Id}`));
  }

  getUnreadMessages() {
    return this.wrap(this.client.get('/messages/unread'));
  }

  markDialogAsRead(peerId: number) {
    return this.wrap(this.client.post(`/messages/read/${peerId}`));
  }

  getMaintenanceLogs() {
    return this.wrap(this.client.get('/maintenance'));
  }

  addMaintenanceLog(payload: Parameters<DataApi['addMaintenanceLog']>[0]) {
    return this.wrap(this.client.post('/maintenance', payload));
  }

  getDashboardStats() {
    return this.wrap(this.client.get('/dashboard/stats'));
  }

  getMissions() {
    return this.wrap(this.client.get('/missions'));
  }

  createMission(payload: Parameters<DataApi['createMission']>[0]) {
    return this.wrap(this.client.post('/missions', payload));
  }

  updateMission(missionId: string, payload: Parameters<DataApi['updateMission']>[1]) {
    return this.wrap(this.client.put(`/missions/${missionId}`, payload));
  }

  updateMissionStatus(missionId: string, status: string) {
    return this.wrap(this.client.put(`/missions/${missionId}/status`, { status }));
  }

  approveMission(missionId: string) {
    return this.wrap(this.client.put(`/missions/${missionId}/approve`));
  }

  rejectMission(missionId: string) {
    return this.wrap(this.client.put(`/missions/${missionId}/reject`));
  }

  private triggerBrowserDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async exportMissionKml(missionId: string) {
    try {
      const res = await this.client.get(`/missions/${missionId}/kml`, {
        responseType: 'text',
        transformRequest: [
          (_data, headers) => {
            if (headers) {
              delete headers['Content-Type'];
            }
            return _data;
          },
        ],
      });
      const blob = new Blob([res.data], { type: 'application/vnd.google-earth.kml+xml' });
      this.triggerBrowserDownload(blob, `mission-${missionId}.kml`);
      return { ok: true as const };
    } catch (err) {
      const ax = err as { response?: { data?: unknown } };
      const data = ax.response?.data;
      if (typeof data === 'object' && data !== null && 'error' in data) {
        const body = data as { message?: string; error?: string };
        return { ok: false as const, error: body.message ?? body.error ?? 'Не удалось экспортировать KML.' };
      }
      return { ok: false as const, error: 'Не удалось экспортировать KML.' };
    }
  }

  downloadMapTiles() {
    return Promise.resolve({ ok: false as const, error: 'Кэш карт недоступен в веб-версии.' });
  }

  getMapCacheStats() {
    return Promise.resolve({ ok: true as const, tileCount: 0, sizeBytes: 0 });
  }

  onMapCacheProgress() {
    return () => {};
  }

  getAvailableBatteries() {
    return this.wrap(this.client.get('/batteries/available'));
  }

  getAllBatteries() {
    return this.wrap(this.client.get('/batteries'));
  }

  addBattery(serial_number: string, type: string, capacity: number) {
    return this.wrap(this.client.post('/batteries', { serial_number, type, capacity }));
  }

  updateBatteryStatus(batteryId: string, status: string) {
    return this.wrap(this.client.put(`/batteries/${batteryId}/status`, { status }));
  }

  getBatteryInspectionLogs() {
    return this.wrap(this.client.get('/batteries/inspections'));
  }

  completeBatteryInspection(batteryId: string, payload: Parameters<DataApi['completeBatteryInspection']>[1]) {
    return this.wrap(this.client.post(`/batteries/${batteryId}/inspection`, payload));
  }

  getSectorsRisk() {
    return this.wrap(this.client.get('/sectors/risk'));
  }

  getWeather(lat: number, lon: number) {
    return this.wrap(this.client.get('/weather', { params: { lat, lon } }));
  }

  createSector(sectorName: string, centerLat: number, centerLon: number, radiusKm?: number, options?: Parameters<DataApi['createSector']>[4]) {
    return this.wrap(
      this.client.post('/sectors', {
        sectorName,
        centerLat,
        centerLon,
        radiusKm,
        options: {
          shape_type: options?.shapeType ?? 'circle',
          boundary_polygon: options?.boundaryPolygon
            ? JSON.stringify(options.boundaryPolygon)
            : null,
        },
      }),
    );
  }

  deleteSector(sectorId: number) {
    return this.wrap(this.client.delete(`/sectors/${sectorId}`));
  }

  updateSectorBoundary(sectorId: number, payload: Parameters<DataApi['updateSectorBoundary']>[1]) {
    const body = {
      ...payload,
      boundary_polygon:
        typeof payload.boundary_polygon === 'string'
          ? payload.boundary_polygon
          : JSON.stringify(payload.boundary_polygon),
    };
    return this.wrap(this.client.put(`/sectors/${sectorId}/boundary`, body));
  }

  async importSectorsKml() {
    return new Promise<ApiResult<{ importedCount?: number }> & { message?: string }>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.kml,application/vnd.google-earth.kml+xml,text/xml';
      input.style.display = 'none';

      const cleanup = () => {
        input.remove();
      };

      input.addEventListener('change', () => {
        void (async () => {
          const file = input.files?.[0];
          cleanup();
          if (!file) {
            resolve({ ok: false, error: 'CANCELLED' });
            return;
          }

          try {
            const kml = await file.text();
            const result = await this.wrap<{ importedCount?: number }>(
              this.client.post('/sectors/import-kml', { kml }),
            );
            if (result.ok) {
              const importedCount = result.data?.importedCount;
              resolve({
                ...result,
                message:
                  importedCount != null
                    ? `Импортировано секторов: ${importedCount}.`
                    : undefined,
              });
              return;
            }
            resolve(result);
          } catch {
            resolve({ ok: false, error: 'Ошибка импорта KML.' });
          }
        })();
      });

      document.body.appendChild(input);
      input.click();
    });
  }

  async exportSectorsKml(sectorId?: number) {
    try {
      const res = await this.client.get('/sectors/export-kml', {
        params: sectorId ? { sectorId } : undefined,
        responseType: 'text',
      });
      const blob = new Blob([res.data], { type: 'application/vnd.google-earth.kml+xml' });
      this.triggerBrowserDownload(blob, sectorId ? `sector-${sectorId}.kml` : 'sectors.kml');
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: 'Ошибка экспорта KML.' };
    }
  }

  syncWeather(sectorId: number, lat: number, lon: number) {
    return this.wrap(this.client.post(`/weather/sync/${sectorId}`, { lat, lon }));
  }

  syncAllSectorsWeather() {
    return this.wrap(this.client.post('/weather/sync-all'));
  }

  insertManualWeather(sectorId: number, windSpeed: number, temperature: number, precipitation: string) {
    return this.wrap(
      this.client.post('/weather/manual', { sectorId, windSpeed, temperature, precipitation }),
    );
  }

  getDrones() {
    return this.wrap(this.client.get('/drones'));
  }

  addDrone(drone: Parameters<DataApi['addDrone']>[0]) {
    return this.wrap(this.client.post('/drones', drone));
  }

  updateDrone(id: number, drone: Parameters<DataApi['updateDrone']>[1]) {
    return this.wrap(this.client.put(`/drones/${id}`, drone));
  }

  deleteDrone(id: number) {
    return this.wrap(this.client.delete(`/drones/${id}`));
  }

  async saveFlightSheetPdf(_defaultFilename: string, _pdfDataBase64: string) {
    return { ok: false as const, error: 'Используйте downloadFlightSheetPdf(missionId).' };
  }

  downloadFlightSheetPdf = async (missionId: string) => {
    try {
      const res = await this.client.get(`/missions/${missionId}/flight-sheet.pdf`, {
        responseType: 'blob',
        headers: { Accept: 'application/pdf' },
        transformRequest: [
          (_data, headers) => {
            if (headers) {
              delete headers['Content-Type'];
            }
            return _data;
          },
        ],
      });

      const blob = res.data as Blob;
      if (!blob || blob.size === 0) {
        return { ok: false as const, error: 'Сервер вернул пустой PDF.' };
      }

      const contentType = String(blob.type || res.headers['content-type'] || '');
      if (contentType.includes('json') || contentType.includes('text/html')) {
        const text = await blob.text();
        try {
          const body = JSON.parse(text) as { message?: string; error?: string };
          return {
            ok: false as const,
            error: body.message ?? body.error ?? 'Не удалось скачать PDF.',
          };
        } catch {
          return { ok: false as const, error: 'Не удалось скачать PDF.' };
        }
      }

      this.triggerBrowserDownload(blob, `flight-sheet-${missionId}.pdf`);
      return { ok: true as const, status: 'saved' as const };
    } catch (err) {
      const ax = err as { response?: { data?: Blob; status?: number } };
      const responseData = ax.response?.data;
      if (responseData instanceof Blob) {
        try {
          const text = await responseData.text();
          const body = JSON.parse(text) as { message?: string; error?: string };
          return {
            ok: false as const,
            error: body.message ?? body.error ?? 'Не удалось скачать PDF.',
          };
        } catch {
          /* fall through */
        }
      }
      return { ok: false as const, error: 'Не удалось скачать PDF.' };
    }
  };

  getSystemOverview() {
    return this.wrap(this.client.get('/system/overview'));
  }

  getAuditLogsPage(filters?: {
    limit?: number;
    offset?: number;
    since?: string;
    until?: string;
    operatorId?: number;
    search?: string;
  }) {
    return this.wrap(this.client.get('/system/audit', { params: filters }));
  }

  getIntegrityReport() {
    return this.wrap(this.client.get('/system/integrity'));
  }

  getSystemErrorLogs(filters?: Record<string, unknown>) {
    return this.wrap(this.client.get('/system/errors', { params: filters }));
  }

  getSystemErrorStats(filters?: { days?: number }) {
    return this.wrap(this.client.get('/system/errors/stats', { params: filters }));
  }

  reportRendererError(payload: Record<string, unknown>) {
    return this.wrap(this.client.post('/system/errors/report', payload));
  }

  completeMaintenance(droneId: number) {
    return this.wrap(this.client.post(`/maintenance/complete/${droneId}`));
  }
}
