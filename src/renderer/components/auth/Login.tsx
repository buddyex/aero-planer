import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getDefaultRouteForRole } from '../../utils/permissions';
import './Login.css';

export function Login() {
  const { login, isLoading, isAuthenticated, user } = useAuth();
  const [loginName, setLoginName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  if (isAuthenticated && user) {
    return <Navigate to={getDefaultRouteForRole(user.role)} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = await login(loginName, pin);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setIsExiting(true);
  };

  return (
    <div className={`login-page${isExiting ? ' login-page--exit' : ''}`}>
      <div className="login-page__glow login-page__glow--1" aria-hidden />
      <div className="login-page__glow login-page__glow--2" aria-hidden />

      <div className="login-card">
        <header className="login-card__header">
          <div className="login-card__logo">AP</div>
          <h1 className="login-card__title">Aero-Planer</h1>
          <p className="login-card__subtitle">АРМ диспетчера БПЛА — авторизация смены</p>
        </header>

        <form className="login-card__form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-field__label" htmlFor="login">
              Логин
            </label>
            <input
              id="login"
              className="form-field__input login-card__input"
              type="text"
              autoComplete="username"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              placeholder="admin"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="pin">
              PIN-код
            </label>
            <input
              id="pin"
              className="form-field__input login-card__input"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              required
              disabled={isLoading}
            />
          </div>

          {error && (
            <p className="login-card__error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn--accent login-card__submit" disabled={isLoading}>
            {isLoading ? 'Вход...' : 'Начать смену'}
          </button>
        </form>

        <footer className="login-card__hint">
          <span>Демо: admin / 1234</span>
          <span>operator1 / 1111</span>
          <span>tech1 / 3333</span>
        </footer>
      </div>
    </div>
  );
}
