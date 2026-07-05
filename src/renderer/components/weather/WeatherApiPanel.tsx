import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import type { WeatherProvider } from '../../types';
import { WEATHER_PROVIDERS } from '../../types';
import { formatDisplayTime } from '../../utils/weather';
import { GlassCard } from '../ui/GlassCard';
import { AppSelect } from '../ui/AppSelect';
import './WeatherApiPanel.css';

export function WeatherApiPanel() {
  const {
    syncWeatherFromApi,
    isSyncingWeather,
    lastWeatherUpdate,
    weatherSyncError,
    lastWeatherSource,
    weatherStatusMessage,
  } = useAppData();
  const [provider] = useState<WeatherProvider>('cascade');

  const handleSync = () => {
    syncWeatherFromApi(provider);
  };

  return (
    <GlassCard accent className="weather-api-panel">
      <h3 className="weather-api-panel__title">Интеграция с API</h3>
      <p className="weather-api-panel__desc">
        Каскадный fallback: CheckWX → NOAA → Open-Meteo по всем секторам
      </p>

      <div className="form-field">
        <label className="form-field__label" htmlFor="weather-provider">
          Провайдер данных
        </label>
        <AppSelect
          id="weather-provider"
          value={provider}
          disabled
          onChange={() => {}}
          options={WEATHER_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
        />
      </div>

      <button
        type="button"
        className="btn btn--accent weather-api-panel__sync"
        onClick={handleSync}
        disabled={isSyncingWeather}
      >
        {isSyncingWeather ? (
          <>
            <span className="weather-api-panel__spinner" />
            Синхронизация...
          </>
        ) : (
          <>⟳ Принудительно обновить погоду из API</>
        )}
      </button>

      {weatherSyncError && (
        <p className="weather-api-panel__error" role="alert">
          {weatherSyncError}
        </p>
      )}

      {weatherStatusMessage && !weatherSyncError && (
        <p className="weather-api-panel__status" role="status">
          {weatherStatusMessage}
        </p>
      )}

      <div className="weather-api-panel__meta">
        <span className="weather-api-panel__meta-label">Последнее обновление:</span>
        <time className="weather-api-panel__meta-value">
          {lastWeatherUpdate ? formatDisplayTime(lastWeatherUpdate) : '— ещё не выполнялось'}
        </time>
      </div>

      {lastWeatherSource && (
        <div className="weather-api-panel__meta">
          <span className="weather-api-panel__meta-label">Источник данных:</span>
          <span className="weather-api-panel__meta-value">{lastWeatherSource}</span>
        </div>
      )}
    </GlassCard>
  );
}
