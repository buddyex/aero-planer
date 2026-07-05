import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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

  return (
    <aside
      className={`sidebar fixed inset-y-0 left-0 z-40 w-[var(--sidebar-width)] transform transition-transform duration-200 md:static md:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="sidebar__brand">
        <div className="sidebar__logo">AP</div>
        <div className="sidebar__brand-text">
          <span className="sidebar__title">Aero-Planer</span>
          <span className="sidebar__subtitle">Control Center</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
            }
          >
            <span className="sidebar__link-icon" aria-hidden>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {user && (
        <div className="sidebar__footer">
          <div className="sidebar__user-mini">
            <span className="sidebar__user-role">{user.role}</span>
            <span className="sidebar__user-name">{user.full_name}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
