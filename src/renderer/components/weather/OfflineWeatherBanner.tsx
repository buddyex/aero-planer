import { formatDisplayTime } from '../../utils/weather';
import './OfflineWeatherBanner.css';

interface OfflineWeatherBannerProps {
  timestamp: string;
}

export function OfflineWeatherBanner({ timestamp }: OfflineWeatherBannerProps) {
  return (
    <div className="offline-weather-banner" role="status">
      <span className="offline-weather-banner__icon" aria-hidden>
        ⧉
      </span>
      <span className="offline-weather-banner__text">
        Offline: данные за {formatDisplayTime(timestamp)}
      </span>
    </div>
  );
}
