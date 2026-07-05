import { useEffect, useState, type FormEvent } from 'react';
import type { Drone, DronePayload } from '../../types';
import { Modal } from '../ui/Modal';
import './DroneFormModal.css';

const EMPTY_FORM: DronePayload = {
  name: '',
  serial_number: '',
  max_wind_speed: 10,
  battery_capacity: 10000,
  payload_capacity: 5,
  flight_time_max: 120,
};

interface DroneFormModalProps {
  open: boolean;
  editingDrone: Drone | null;
  onClose: () => void;
  onSubmit: (payload: DronePayload) => Promise<{ ok: boolean; error?: string }>;
}

export function DroneFormModal({ open, editingDrone, onClose, onSubmit }: DroneFormModalProps) {
  const [form, setForm] = useState<DronePayload>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLocalError('');
    if (editingDrone) {
      setForm({
        name: editingDrone.name,
        serial_number: editingDrone.serial_number,
        max_wind_speed: editingDrone.max_wind_speed,
        battery_capacity: editingDrone.battery_capacity,
        payload_capacity: editingDrone.payload_capacity,
        flight_time_max: editingDrone.flight_time_max,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, editingDrone]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError('');
    setSaving(true);

    const result = await onSubmit(form);
    setSaving(false);

    if (result.ok) {
      onClose();
      return;
    }

    setLocalError(result.error ?? 'Не удалось сохранить данные борта.');
  };

  const updateField = <K extends keyof DronePayload>(key: K, value: DronePayload[K]) => {
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
          <div className="form-field">
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
          </div>

          <div className="form-field">
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
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="drone-wind">
              Макс. ветер (м/с)
            </label>
            <input
              id="drone-wind"
              type="number"
              className="form-field__input"
              value={form.max_wind_speed}
              onChange={(e) => updateField('max_wind_speed', Number(e.target.value))}
              min={0.1}
              step={0.1}
              required
            />
            <span className="form-field__hint">Критично для интеграции с метео-модулем</span>
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="drone-battery">
              Ёмкость АКБ (мАч)
            </label>
            <input
              id="drone-battery"
              type="number"
              className="form-field__input"
              value={form.battery_capacity}
              onChange={(e) => updateField('battery_capacity', Number(e.target.value))}
              min={1}
              step={1}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="drone-payload">
              Грузоподъёмность (кг)
            </label>
            <input
              id="drone-payload"
              type="number"
              className="form-field__input"
              value={form.payload_capacity}
              onChange={(e) => updateField('payload_capacity', Number(e.target.value))}
              min={0.1}
              step={0.1}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="drone-flight">
              Макс. время полёта (мин)
            </label>
            <input
              id="drone-flight"
              type="number"
              className="form-field__input"
              value={form.flight_time_max}
              onChange={(e) => updateField('flight_time_max', Number(e.target.value))}
              min={1}
              step={1}
              required
            />
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
