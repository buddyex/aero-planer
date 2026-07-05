import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useApi } from '../../context/ApiContext';
import { useAuth } from '../../context/AuthContext';
import { useComms } from '../../context/CommsContext';
import { useTheme } from '../../context/ThemeContext';
import type { OperatorKPIs, OperatorProfile, OperatorRole } from '../../types';
import { getRolePermissions } from '../../utils/permissions';
import { getProfileKpiConfig } from '../../utils/operationalKpis';
import { GlassCard } from '../ui/GlassCard';
import { KpiCard } from '../ui/KpiCard';
import './Profile.css';

function formatShiftDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
}

export function Profile() {
  const { operatorId: operatorIdParam } = useParams();
  const { user, shiftStartTime, logout } = useAuth();
  const api = useApi();
  const { openComms } = useComms();
  const { theme, toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();

  const parsedId = operatorIdParam ? Number(operatorIdParam) : null;
  const isOwnProfile = !parsedId || parsedId === user?.id;

  const [elapsed, setElapsed] = useState('00:00:00');
  const [kpis, setKpis] = useState<OperatorKPIs | null>(null);
  const [colleague, setColleague] = useState<OperatorProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEndingShift, setIsEndingShift] = useState(false);

  useEffect(() => {
    if (parsedId && user && parsedId === user.id) {
      navigate('/profile', { replace: true });
    }
  }, [parsedId, user, navigate]);

  useEffect(() => {
    if (!isOwnProfile || !shiftStartTime) return;

    const tick = () => {
      setElapsed(formatShiftDuration(Date.now() - shiftStartTime.getTime()));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [shiftStartTime, isOwnProfile]);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      if (isOwnProfile) {
        setColleague(null);
        setLoadError(null);
        const kpiResult = await api.getOperatorKPIs();
        if (kpiResult.ok && kpiResult.data) {
          setKpis(kpiResult.data as OperatorKPIs);
        }
        return;
      }

      if (!parsedId || Number.isNaN(parsedId)) {
        navigate('/profile', { replace: true });
        return;
      }

      setLoadError(null);
      const result = await api.getOperatorProfile(parsedId);
      if (!result?.ok || !result.data) {
        setLoadError(result?.error ?? 'Не удалось загрузить профиль.');
        setColleague(null);
        return;
      }

      const data = result.data;
      setColleague({
        id: data.id,
        full_name: data.full_name,
        login: data.login,
        role: data.role as OperatorRole,
        duty_status: data.duty_status,
        kpis: data.kpis,
      });
      setKpis(data.kpis);
    };

    void load();
    const refresh = setInterval(load, 30000);
    return () => clearInterval(refresh);
  }, [user, isOwnProfile, parsedId, navigate, api]);

  const handleLogout = async () => {
    setIsEndingShift(true);
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  const displayUser = isOwnProfile
    ? user
    : colleague
      ? {
          id: colleague.id,
          full_name: colleague.full_name,
          login: colleague.login,
          role: colleague.role,
        }
      : null;

  if (!isOwnProfile && !displayUser && !loadError) {
    return (
      <div className="profile">
        <p className="profile__desc">Загрузка профиля…</p>
      </div>
    );
  }

  if (!isOwnProfile && loadError) {
    return (
      <div className="profile">
        <header className="profile__header">
          <button type="button" className="profile__back btn btn--secondary btn--sm" onClick={() => navigate(-1)}>
            ← Назад
          </button>
          <h2 className="profile__title">Профиль сотрудника</h2>
        </header>
        <GlassCard className="profile__card">
          <p className="profile__error">{loadError}</p>
        </GlassCard>
      </div>
    );
  }

  if (!displayUser) return null;

  const permissions = getRolePermissions(displayUser.role);
  const kpiCards = getProfileKpiConfig(displayUser.role, kpis);

  return (
    <div className={`profile${isEndingShift ? ' profile--exit' : ''}`}>
      <header className="profile__header">
        {!isOwnProfile && (
          <button
            type="button"
            className="profile__back btn btn--secondary btn--sm"
            onClick={() => navigate(-1)}
          >
            ← Назад
          </button>
        )}
        <h2 className="profile__title">{isOwnProfile ? 'Личный кабинет' : 'Профиль сотрудника'}</h2>
        <p className="profile__desc">
          {isOwnProfile
            ? 'Информационный хаб оператора смены'
            : 'Просмотр информации о коллеге'}
        </p>
      </header>

      <div className="profile__grid">
        <GlassCard accent className="profile__card profile__card--overview">
          <div className="profile__overview-main">
            <div className="profile__identity">
              <div className="profile__avatar">{displayUser.full_name.charAt(0)}</div>
              <div>
                <p className="profile__name">{displayUser.full_name}</p>
                <p className="profile__role">{displayUser.role}</p>
                <p className="profile__login">@{displayUser.login}</p>
                {!isOwnProfile && colleague?.role === 'Оператор' && (
                  <span className={`profile__duty profile__duty--${colleague.duty_status === 'Свободен' ? 'free' : 'busy'}`}>
                    {colleague.duty_status}
                  </span>
                )}
              </div>
            </div>

            {isOwnProfile ? (
              <div className="profile__shift">
                <span className="profile__shift-label">Время на посту</span>
                <div className="profile__shift-timer" aria-live="polite">
                  {elapsed}
                </div>
                <p className="profile__shift-start">
                  Начало:{' '}
                  {shiftStartTime
                    ? shiftStartTime.toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </p>
              </div>
            ) : (
              <div className="profile__actions">
                <button
                  type="button"
                  className="btn btn--accent profile__message-btn"
                  onClick={() => openComms(displayUser.id, { focusComposer: true })}
                >
                  <span className="profile__message-icon" aria-hidden>
                    ✉
                  </span>
                  Написать
                </button>
              </div>
            )}
          </div>

          <div className="profile__permissions">
            <span className="profile__permissions-label">Допуски</span>
            <ul className="profile__permissions-list">
              {permissions.map((perm) => (
                <li key={perm}>{perm}</li>
              ))}
            </ul>
          </div>
        </GlassCard>

        <GlassCard className="profile__card profile__card--stats">
          <h3 className="profile__card-title">
            {isOwnProfile ? 'Моя статистика' : 'Статистика сотрудника'}
          </h3>
          <div className={`profile__kpi-row${kpiCards.length > 4 ? ' profile__kpi-row--wrap' : ''}`}>
            {kpiCards.map((card) => (
              <KpiCard
                key={card.key}
                label={card.label}
                value={card.value}
                variant={card.variant}
                icon={<span>{card.icon}</span>}
              />
            ))}
          </div>
        </GlassCard>

        {isOwnProfile && (
          <GlassCard className="profile__card profile__card--settings">
            <h3 className="profile__card-title">Настройки</h3>

            <div className="profile__theme-row">
              <div>
                <p className="profile__theme-label">Тема интерфейса</p>
                <p className="profile__theme-value">{isDark ? 'Тёмная' : 'Светлая'}</p>
              </div>
              <button type="button" className="theme-toggle profile__theme-toggle" onClick={toggleTheme}>
                <span className="theme-toggle__icon" aria-hidden>
                  {isDark ? '☀' : '☾'}
                </span>
                <span className="theme-toggle__track">
                  <span
                    className={`theme-toggle__thumb ${isDark ? '' : 'theme-toggle__thumb--light'}`}
                  />
                </span>
              </button>
            </div>

            <p className="profile__theme-hint">
              Настройка сохраняется в localStorage ({theme})
            </p>

            <button
              type="button"
              className="btn btn--danger profile__logout"
              onClick={handleLogout}
              disabled={isEndingShift}
            >
              {isEndingShift ? 'Завершение...' : 'Завершить смену / Выход'}
            </button>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
