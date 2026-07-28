import { useAppData } from '../../context/AppDataContext';
import { formatDisplayTime } from '../../utils/weather';
import { cn } from '../../utils/cn';
import './DashboardWeatherControls.css';

interface DashboardWeatherControlsProps {
  /** Icon-only sync button for dense chrome (mobile HUD). */
  compact?: boolean;
  className?: string;
}

export function DashboardWeatherControls({
  compact = false,
  className,
}: DashboardWeatherControlsProps) {
  const {
    syncWeatherFromApi,
    isSyncingWeather,
    lastWeatherUpdate,
    weatherSyncStatus,
    weatherStatusMessage,
  } = useAppData();

  const handleRefresh = () => {
    syncWeatherFromApi('cascade');
  };

  if (compact) {
    return (
      <button
        type="button"
        className={cn('dashboard-weather-controls__compact', className)}
        onClick={handleRefresh}
        disabled={isSyncingWeather}
        title="Обновить погоду"
        aria-label={isSyncingWeather ? 'Обновление погоды…' : 'Обновить погоду'}
      >
        {isSyncingWeather ? (
          <span className="dashboard-weather-controls__spinner" aria-hidden />
        ) : (
          <span aria-hidden>⟳</span>
        )}
      </button>
    );
  }

  return (
    <section
      className={cn('dashboard-weather-controls', className)}
      aria-label="Управление метеоданными"
    >
      <div className="dashboard-weather-controls__row">
        <button
          type="button"
          className="btn btn--accent dashboard-weather-controls__sync"
          onClick={handleRefresh}
          disabled={isSyncingWeather}
        >
          {isSyncingWeather ? (
            <>
              <span className="dashboard-weather-controls__spinner" aria-hidden />
              Обновление...
            </>
          ) : (
            <>⟳ Обновить данные о погоде</>
          )}
        </button>

        <div className="dashboard-weather-controls__meta">
          <span className="dashboard-weather-controls__meta-label">Последнее обновление</span>
          <time className="dashboard-weather-controls__meta-value">
            {lastWeatherUpdate ? formatDisplayTime(lastWeatherUpdate) : '— ещё не выполнялось'}
          </time>
        </div>
      </div>

      {weatherStatusMessage && weatherSyncStatus !== 'idle' && (
        <p
          className={`dashboard-weather-controls__status dashboard-weather-controls__status--${weatherSyncStatus}`}
          role="status"
        >
          {weatherStatusMessage}
        </p>
      )}
    </section>
  );
}
