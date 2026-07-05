import { WeatherApiPanel } from './WeatherApiPanel';
import { WeatherManualPanel } from './WeatherManualPanel';
import { OfflineWeatherBanner } from './OfflineWeatherBanner';
import { SectorGrid } from './SectorGrid';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { canForceWeatherSync, canManualWeatherInput } from '../../utils/permissions';
import './WeatherCenter.css';

export function WeatherCenter() {
  const { weatherOfflineTimestamp, manualWeatherMode } = useAppData();
  const { user } = useAuth();

  const showApiPanel = user && canForceWeatherSync(user.role);
  const showManualPanel = user && canManualWeatherInput(user.role);

  return (
    <div className="weather-center">
      <header className="weather-center__hero">
        <div className="weather-center__hero-top">
          <h2 className="weather-center__title">Метео-центр</h2>
          {weatherOfflineTimestamp && (
            <OfflineWeatherBanner timestamp={weatherOfflineTimestamp} />
          )}
        </div>
        <p className="weather-center__desc">
          Автосинхронизация каждые 10 мин · каскад CheckWX → NOAA → Open-Meteo
          {manualWeatherMode && ' · режим ручного ввода активен'}
        </p>
      </header>

      <div className="weather-center__panels">
        {showApiPanel && <WeatherApiPanel />}
        {showManualPanel && (
          <div className={manualWeatherMode ? 'weather-center__manual--urgent' : undefined}>
            <WeatherManualPanel />
          </div>
        )}
      </div>

      <SectorGrid />
    </div>
  );
}
