import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatShortFio } from '../../utils/fio';
import type { AppRoute } from '../../utils/permissions';
import { ROUTE_ALLOWED_ROLES } from '../../utils/permissions';
import './Sidebar.css';

const navItems: { to: string; route: AppRoute; label: string; icon: string }[] = [
  { to: '/', route: 'dashboard', label: 'Дашборд', icon: '◈' },
  { to: '/schedule', route: 'schedule', label: 'Расписание', icon: '▤' },
  { to: '/fleet', route: 'fleet', label: 'Флот', icon: '✈' },
  { to: '/maintenance', route: 'maintenance', label: 'Журнал ТО', icon: '⚙' },
  { to: '/weather', route: 'weather', label: 'Метео-центр', icon: '☁' },
  { to: '/personnel', route: 'personnel', label: 'Коллеги', icon: '👥' },
  { to: '/admin', route: 'admin', label: 'Управление', icon: '👤' },
  { to: '/system', route: 'system', label: 'Система', icon: '⛁' },
  { to: '/profile', route: 'profile', label: 'Кабинет', icon: '◎' },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const { user } = useAuth();

  const visibleItems = user
    ? navItems.filter((item) => ROUTE_ALLOWED_ROLES[item.route].includes(user.role))
    : [];

  const className = ['sidebar', open ? 'sidebar--open' : 'sidebar--closed'].join(' ');

  return (
    <aside className={className}>
      <nav className="sidebar__nav" aria-label="Основная навигация">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onClose}
            title={item.label}
            className={({ isActive }) =>
              `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
            }
          >
            <span className="sidebar__link-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="sidebar__link-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {user && (
        <div className="sidebar__footer">
          <div className="sidebar__user-mini" title={`${user.role}: ${formatShortFio(user.full_name)}`}>
            <span className="sidebar__user-role">{user.role}</span>
            <span className="sidebar__user-name">{formatShortFio(user.full_name)}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
