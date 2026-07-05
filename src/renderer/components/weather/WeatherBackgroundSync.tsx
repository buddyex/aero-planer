import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../context/AppDataContext';

const WEATHER_SYNC_INTERVAL_MS = 600_000;
const WEATHER_SYNC_STORAGE_KEY = 'aero-planer-last-weather-sync';
const INITIAL_SYNC_DELAY_MS = 5_000;

function readLastSyncMs(): number {
  const raw = sessionStorage.getItem(WEATHER_SYNC_STORAGE_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Фоновая синхронизация метеоданных по всем секторам каждые 10 минут.
 * Не блокирует загрузку UI и не запускает повторно, пока идёт предыдущий запрос.
 */
export function WeatherBackgroundSync() {
  const { isAuthenticated, isLoading } = useAuth();
  const { syncWeatherFromApi } = useAppData();
  const syncRef = useRef(syncWeatherFromApi);
  const inFlightRef = useRef(false);

  syncRef.current = syncWeatherFromApi;

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const maybeSync = (force = false) => {
      if (inFlightRef.current) return;

      const now = Date.now();
      const lastSync = readLastSyncMs();
      if (!force && now - lastSync < WEATHER_SYNC_INTERVAL_MS) return;

      inFlightRef.current = true;
      void syncRef
        .current('cascade')
        .then(() => {
          sessionStorage.setItem(WEATHER_SYNC_STORAGE_KEY, String(Date.now()));
        })
        .catch((error) => {
          console.error('[WeatherBackgroundSync]', error);
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const initialTimer = window.setTimeout(() => maybeSync(false), INITIAL_SYNC_DELAY_MS);
    const intervalTimer = window.setInterval(() => maybeSync(false), WEATHER_SYNC_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
    };
  }, [isAuthenticated, isLoading]);

  return null;
}
