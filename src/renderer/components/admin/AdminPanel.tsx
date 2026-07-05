import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../context/ApiContext';
import type { AuthUser, OperatorRole } from '../../types';
import { OPERATOR_ROLES } from '../../types';
import { GlassCard } from '../ui/GlassCard';
import { AppSelect } from '../ui/AppSelect';
import { Modal } from '../ui/Modal';
import './AdminPanel.css';

const ROLE_OPTIONS: OperatorRole[] = OPERATOR_ROLES;

interface OperatorForm {
  full_name: string;
  login: string;
  pin_code: string;
  role: OperatorRole;
}

const EMPTY_FORM: OperatorForm = {
  full_name: '',
  login: '',
  pin_code: '',
  role: 'Оператор',
};

export function AdminPanel() {
  const { user } = useAuth();
  const api = useApi();
  const [operators, setOperators] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [form, setForm] = useState<OperatorForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOperators = useCallback(async () => {
    setLoading(true);
    const result = await api.getAllOperators();
    if (result.ok && result.data) {
      setOperators(result.data as AuthUser[]);
    }
    setLoading(false);
  }, [api]);

  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (op: AuthUser) => {
    setEditing(op);
    setForm({
      full_name: op.full_name,
      login: op.login,
      pin_code: '****',
      role: op.role,
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError(null);

    const payload = {
      full_name: form.full_name,
      login: form.login,
      pin_code: form.pin_code === '****' ? undefined : form.pin_code,
      role: form.role,
    };

    const result = editing
      ? await api.updateOperator(editing.id, payload)
      : await api.createOperator({
          ...payload,
          pin_code: form.pin_code,
        });

    if (!result.ok) {
      setError(result.error ?? 'Ошибка сохранения.');
      setSaving(false);
      return;
    }

    setModalOpen(false);
    setSaving(false);
    await loadOperators();
  };

  const handleDelete = async (operatorId: number) => {
    if (!user || !window.confirm('Удалить пользователя?')) return;

    const result = await api.deleteOperator(operatorId);
    if (!result.ok) {
      alert(result.error ?? 'Не удалось удалить.');
      return;
    }

    await loadOperators();
  };

  return (
    <div className="admin-panel">
      <header className="admin-panel__header">
        <div>
          <h2 className="admin-panel__title">Управление персоналом</h2>
        </div>
        <button type="button" className="btn btn--primary" onClick={openCreate}>
          + Добавить пользователя
        </button>
      </header>

      <GlassCard className="admin-panel__table-card">
        {loading ? (
          <p className="admin-panel__loading">Загрузка...</p>
        ) : (
          <table className="admin-panel__table">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Логин</th>
                <th>Роль</th>
                <th>Занятость</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr key={op.id} className="admin-panel__row">
                  <td>
                    <Link to={`/profile/${op.id}`} className="operator-link">
                      {op.full_name}
                    </Link>
                  </td>
                  <td>@{op.login}</td>
                  <td>
                    <span className={`admin-panel__role admin-panel__role--${op.role}`}>
                      {op.role}
                    </span>
                  </td>
                  <td>
                    {op.role === 'Оператор'
                      ? (op as { duty_status?: string }).duty_status ?? 'Свободен'
                      : '—'}
                  </td>
                  <td>
                    <div className="admin-panel__actions">
                      <Link
                        to={`/profile/${op.id}`}
                        className="btn btn--secondary btn--sm"
                      >
                        Профиль
                      </Link>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => openEdit(op)}
                      >
                        Изменить
                      </button>
                      {op.id !== user?.id && (
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => handleDelete(op.id)}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Редактирование' : 'Новый пользователь'}>
        <form className="admin-panel__form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-field__label" htmlFor="admin-fullname">
              ФИО
            </label>
            <input
              id="admin-fullname"
              className="form-field__input"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="admin-login">
              Логин
            </label>
            <input
              id="admin-login"
              className="form-field__input"
              value={form.login}
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="admin-pin">
              PIN-код
            </label>
            <input
              id="admin-pin"
              className="form-field__input"
              type="password"
              value={form.pin_code}
              onChange={(e) => setForm((f) => ({ ...f, pin_code: e.target.value }))}
              required={!editing}
              placeholder={editing ? 'Оставьте **** чтобы не менять' : ''}
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="admin-role">
              Роль
            </label>
            <AppSelect
              id="admin-role"
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v as OperatorRole }))}
              options={ROLE_OPTIONS.map((role) => ({ value: role, label: role }))}
            />
          </div>

          {error && (
            <p className="admin-panel__error" role="alert">
              {error}
            </p>
          )}

          <div className="admin-panel__form-actions">
            <button type="button" className="btn btn--secondary" onClick={() => setModalOpen(false)}>
              Отмена
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
