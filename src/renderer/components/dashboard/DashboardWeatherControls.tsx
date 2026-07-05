import { useAppData } from '../../context/AppDataContext';
import { formatDisplayTime } from '../../utils/weather';
import './DashboardWeatherControls.css';

export function DashboardWeatherControls() {
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

  return (
    <section className="dashboard-weather-controls" aria-label="Управление метеоданными">
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
