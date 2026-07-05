import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

function formatDateTime(date: Date): string {
  return date.toLocaleString('ru-RU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface HeaderProps {
  onOpenComms?: () => void;
  hasUnread?: boolean;
  onMenuToggle?: () => void;
}

export function Header({ onOpenComms, hasUnread = false, onMenuToggle }: HeaderProps) {
  const { user, shiftStartTime } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="header">
      <div className="header__left">
        <button
          type="button"
          className="header__menu-btn md:hidden"
          onClick={onMenuToggle}
          aria-label="Открыть меню"
        >
          ☰
        </button>
        <div>
        <h1 className="header__page-title">Центр управления полётами</h1>
        <p className="header__page-subtitle">АРМ диспетчера БПЛА — облачный режим</p>
        </div>
      </div>

      <div className="header__right">
        <div className="header__clock">
          <span className="header__clock-label">Системное время</span>
          <time className="header__clock-value" dateTime={now.toISOString()}>
            {formatDateTime(now)}
          </time>
        </div>

        {onOpenComms && (
          <button
            type="button"
            className={`header__comms-btn${hasUnread ? ' header__comms-btn--unread' : ''}`}
            onClick={onOpenComms}
            title="Терминал связи"
            aria-label={hasUnread ? 'Открыть терминал связи (есть непрочитанные)' : 'Открыть терминал связи'}
          >
            <span className="header__comms-icon-wrap">
              <span className="header__comms-icon" aria-hidden="true">
                ✉
              </span>
              {hasUnread && <span className="header__comms-badge" aria-hidden="true" />}
            </span>
            <span className="header__comms-label">Связь</span>
          </button>
        )}

        {user && (
          <Link to="/profile" className="header__user header__user--link">
            <div className="header__avatar">{user.full_name.charAt(0)}</div>
            <div className="header__user-info">
              <span className="header__user-name">{user.full_name}</span>
              <span className="header__user-role">{user.role}</span>
              {shiftStartTime && (
                <span className="header__shift-hint">
                  Смена с{' '}
                  {shiftStartTime.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </Link>
        )}
      </div>
    </header>
  );
}
