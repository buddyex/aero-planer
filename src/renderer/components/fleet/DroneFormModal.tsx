import { useEffect, useState, type FormEvent } from 'react';
import type { Drone, DronePayload } from '../../types';
import { Modal } from '../ui/Modal';
import './DroneFormModal.css';

type NumericField = 'max_wind_speed' | 'battery_capacity' | 'payload_capacity' | 'flight_time_max';

interface DroneFormState {
  name: string;
  serial_number: string;
  max_wind_speed: string;
  battery_capacity: string;
  payload_capacity: string;
  flight_time_max: string;
}

const EMPTY_FORM: DroneFormState = {
  name: '',
  serial_number: '',
  max_wind_speed: '10',
  battery_capacity: '10000',
  payload_capacity: '5',
  flight_time_max: '120',
};

function toFormState(source?: Pick<Drone, keyof DronePayload>): DroneFormState {
  if (!source) return EMPTY_FORM;
  return {
    name: source.name,
    serial_number: source.serial_number,
    max_wind_speed: String(source.max_wind_speed),
    battery_capacity: String(source.battery_capacity),
    payload_capacity: String(source.payload_capacity),
    flight_time_max: String(source.flight_time_max),
  };
}

function validateFormState(form: DroneFormState): { ok: true; payload: DronePayload } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) {
    errors.name = 'Укажите название борта.';
  }
  if (!form.serial_number.trim()) {
    errors.serial_number = 'Укажите серийный номер.';
  }

  const numericFields: { key: NumericField; label: string }[] = [
    { key: 'max_wind_speed', label: 'Макс. ветер' },
    { key: 'battery_capacity', label: 'Ёмкость АКБ' },
    { key: 'payload_capacity', label: 'Грузоподъёмность' },
    { key: 'flight_time_max', label: 'Макс. время полёта' },
  ];

  const payload: DronePayload = {
    name: form.name.trim(),
    serial_number: form.serial_number.trim(),
    max_wind_speed: 0,
    battery_capacity: 0,
    payload_capacity: 0,
    flight_time_max: 0,
  };

  for (const { key, label } of numericFields) {
    const raw = form[key].trim();
    if (!raw) {
      errors[key] = `Укажите значение поля «${label}».`;
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      errors[key] = `Поле «${label}» должно быть положительным числом.`;
      continue;
    }
    payload[key] = value;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, payload };
}

interface DroneFormModalProps {
  open: boolean;
  editingDrone: Drone | null;
  onClose: () => void;
  onSubmit: (payload: DronePayload) => Promise<{ ok: boolean; error?: string }>;
}

export function DroneFormModal({ open, editingDrone, onClose, onSubmit }: DroneFormModalProps) {
  const [form, setForm] = useState<DroneFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setLocalError('');
    setFieldErrors({});
    setForm(editingDrone ? toFormState(editingDrone) : EMPTY_FORM);
  }, [open, editingDrone]);

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError('');
    setFieldErrors({});

    const parsed = validateFormState(form);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }

    setSaving(true);
    const result = await onSubmit(parsed.payload);
    setSaving(false);

    if (result.ok) {
      onClose();
      return;
    }

    setLocalError(result.error ?? 'Не удалось сохранить данные борта.');
  };

  const updateField = <K extends keyof DroneFormState>(key: K, value: DroneFormState[K]) => {
    clearFieldError(key);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingDrone ? 'Редактировать дрон' : 'Добавить дрон'}
      wide
    >
      <form className="drone-form" onSubmit={handleSubmit}>
        <div className="drone-form__grid">
          <div className={`form-field${fieldErrors.name ? ' form-field--invalid' : ''}`}>
            <label className="form-field__label" htmlFor="drone-name">
              Название / модель
            </label>
            <input
              id="drone-name"
              className="form-field__input"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Геоскан 201, DJI Matrice 300"
              required
            />
            {fieldErrors.name && <p className="form-field__error">{fieldErrors.name}</p>}
          </div>

          <div className={`form-field${fieldErrors.serial_number ? ' form-field--invalid' : ''}`}>
            <label className="form-field__label" htmlFor="drone-serial">
              Серийный номер
            </label>
            <input
              id="drone-serial"
              className="form-field__input"
              value={form.serial_number}
              onChange={(e) => updateField('serial_number', e.target.value)}
              placeholder="ORL-001"
              required
            />
            {fieldErrors.serial_number && <p className="form-field__error">{fieldErrors.serial_number}</p>}
          </div>

          <div className={`form-field${fieldErrors.max_wind_speed ? ' form-field--invalid' : ''}`}>
            <label className="form-field__label" htmlFor="drone-wind">
              Макс. ветер (м/с)
            </label>
            <input
              id="drone-wind"
              type="number"
              inputMode="decimal"
              className="form-field__input"
              value={form.max_wind_speed}
              onChange={(e) => updateField('max_wind_speed', e.target.value)}
              min={0.1}
              step={0.1}
              required
            />
            <span className="form-field__hint">Критично для интеграции с метео-модулем</span>
            {fieldErrors.max_wind_speed && <p className="form-field__error">{fieldErrors.max_wind_speed}</p>}
          </div>

          <div className={`form-field${fieldErrors.battery_capacity ? ' form-field--invalid' : ''}`}>
            <label className="form-field__label" htmlFor="drone-battery">
              Ёмкость АКБ (мАч)
            </label>
            <input
              id="drone-battery"
              type="number"
              inputMode="numeric"
              className="form-field__input"
              value={form.battery_capacity}
              onChange={(e) => updateField('battery_capacity', e.target.value)}
              min={1}
              step={1}
              required
            />
            {fieldErrors.battery_capacity && <p className="form-field__error">{fieldErrors.battery_capacity}</p>}
          </div>

          <div className={`form-field${fieldErrors.payload_capacity ? ' form-field--invalid' : ''}`}>
            <label className="form-field__label" htmlFor="drone-payload">
              Грузоподъёмность (кг)
            </label>
            <input
              id="drone-payload"
              type="number"
              inputMode="decimal"
              className="form-field__input"
              value={form.payload_capacity}
              onChange={(e) => updateField('payload_capacity', e.target.value)}
              min={0.1}
              step={0.1}
              required
            />
            {fieldErrors.payload_capacity && <p className="form-field__error">{fieldErrors.payload_capacity}</p>}
          </div>

          <div className={`form-field${fieldErrors.flight_time_max ? ' form-field--invalid' : ''}`}>
            <label className="form-field__label" htmlFor="drone-flight">
              Макс. время полёта (мин)
            </label>
            <input
              id="drone-flight"
              type="number"
              inputMode="numeric"
              className="form-field__input"
              value={form.flight_time_max}
              onChange={(e) => updateField('flight_time_max', e.target.value)}
              min={1}
              step={1}
              required
            />
            {fieldErrors.flight_time_max && <p className="form-field__error">{fieldErrors.flight_time_max}</p>}
          </div>

          {editingDrone && (
            <div className="form-field">
              <label className="form-field__label" htmlFor="drone-flight-hours">
                Накопленный налёт (ч)
              </label>
              <input
                id="drone-flight-hours"
                type="text"
                className="form-field__input"
                value={`${(editingDrone.flight_hours ?? 0).toFixed(1)} ч`}
                readOnly
                tabIndex={-1}
              />
              <span className="form-field__hint">Сбрасывается после планового ТО. Лимит: 100 ч.</span>
            </div>
          )}
        </div>

        {localError && <p className="form-field__error">{localError}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? (
              <>
                <span className="drone-form__spinner" aria-hidden />
                Сохранение…
              </>
            ) : editingDrone ? (
              'Сохранить изменения'
            ) : (
              'Добавить борт'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
