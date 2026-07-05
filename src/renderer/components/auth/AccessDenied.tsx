import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getDefaultRouteForRole } from '../../utils/permissions';
import { GlassCard } from '../ui/GlassCard';
import './AccessDenied.css';

export function AccessDenied() {
  const { user } = useAuth();
  const homePath = user ? getDefaultRouteForRole(user.role) : '/login';

  return (
    <div className="access-denied">
      <div className="access-denied__glow access-denied__glow--1" aria-hidden />
      <div className="access-denied__glow access-denied__glow--2" aria-hidden />

      <GlassCard accent className="access-denied__card">
        <div className="access-denied__icon" aria-hidden>
          ⛔
        </div>
        <h2 className="access-denied__title">Доступ запрещён</h2>
        <p className="access-denied__message">
          У вашей роли
          {user ? (
            <>
              {' '}
              <span className="access-denied__role">{user.role}</span>
            </>
          ) : null}{' '}
          недостаточно прав для просмотра этой страницы.
        </p>
        <p className="access-denied__hint">
          Обратитесь к администратору системы, если считаете, что это ошибка.
        </p>
        <Link to={homePath} className="btn btn--primary access-denied__btn">
          Вернуться на главную
        </Link>
      </GlassCard>
    </div>
  );
}
