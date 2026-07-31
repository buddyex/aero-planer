import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { canForceWeatherSync } from '../../utils/permissions';
import { fioAvatarLetter, formatShortFio } from '../../utils/fio';
import { DashboardWeatherControls } from '../dashboard/DashboardWeatherControls';
import './Header.css';

interface HeaderProps {
  onOpenComms?: () => void;
  hasUnread?: boolean;
  sidebarOpen?: boolean;
  onMenuToggle?: () => void;
}

export function Header({
  onOpenComms,
  hasUnread = false,
  sidebarOpen = false,
  onMenuToggle,
}: HeaderProps) {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { sectors, activeMissionsCount, operationalOverview, weatherSyncStatus } = useAppData();
  const [now, setNow] = useState(() => new Date());
  const showWeatherControls = Boolean(user && canForceWeatherSync(user.role));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const highRisk = operationalOverview.high_risk_sectors;
  const clock = now.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="status-tape">
      <button
        type="button"
        className="status-tape__menu"
        onClick={onMenuToggle}
        aria-label={sidebarOpen ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={sidebarOpen}
      >
        ☰
      </button>

      <div className="status-tape__brand">
        <span className="status-tape__mark" aria-hidden />
        <div className="status-tape__brand-text">
          <span className="status-tape__name">
            AERO-<span>PLANER</span>
          </span>
          <span className="status-tape__tagline">Центр управления полётами</span>
        </div>
      </div>

      <div className="status-tape__seg status-tape__seg--live status-tape__seg--hide-xs">
        <span>LIVE</span>
        <strong>{activeMissionsCount}</strong>
      </div>

      <div className="status-tape__seg status-tape__seg--hide-sm">
        <span>СЕКТОРЫ</span>
        <strong>{sectors.length}</strong>
      </div>

      <div
        className={`status-tape__seg status-tape__seg--hide-xs${highRisk > 0 ? ' status-tape__seg--warn' : ''}`}
      >
        <span>РИСК</span>
        <strong>{highRisk > 0 ? highRisk : 'OK'}</strong>
      </div>

      <div className="status-tape__seg status-tape__seg--hide-md">
        <span>МЕТЕО</span>
        <strong>
          {weatherSyncStatus === 'fresh'
            ? 'SYNC'
            : weatherSyncStatus === 'cached'
              ? 'CACHE'
              : weatherSyncStatus === 'error'
                ? 'ERR'
                : '—'}
        </strong>
      </div>

      <div className="status-tape__spacer" />

      <div className="status-tape__sys-time" title="Системное время">
        <span className="status-tape__sys-time-label">Системное время</span>
        <time className="status-tape__clock" dateTime={now.toISOString()}>
          {clock}
        </time>
      </div>

      {showWeatherControls && (
        <DashboardWeatherControls compact className="status-tape__weather" />
      )}

      <button
        type="button"
        className="status-tape__btn"
        onClick={toggleTheme}
        title={isDark ? 'Светлая тема' : 'Тёмная тема'}
        aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      >
        {isDark ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
      </button>

      {onOpenComms && (
        <button
          type="button"
          className={`status-tape__btn${hasUnread ? ' status-tape__btn--unread' : ''}`}
          onClick={onOpenComms}
          title="Терминал связи"
          aria-label={
            hasUnread
              ? 'Открыть терминал связи (есть непрочитанные)'
              : 'Открыть терминал связи'
          }
        >
          ✉
          {hasUnread && <span className="status-tape__dot" aria-hidden />}
        </button>
      )}

      {user && (
        <Link to="/profile" className="status-tape__user">
          <span className="status-tape__avatar">{fioAvatarLetter(user.full_name)}</span>
          <span className="status-tape__user-meta">
            <span className="status-tape__user-role">{user.role}</span>
            <span className="status-tape__user-name">{formatShortFio(user.full_name)}</span>
          </span>
        </Link>
      )}
    </header>
  );
}
