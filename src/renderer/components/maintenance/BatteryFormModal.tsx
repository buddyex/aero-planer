import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { AppSelect } from '../ui/AppSelect';
import './BatteryRegistry.css';

const BATTERY_TYPES = ['LiPo', 'LiIon'] as const;

interface BatteryFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    serial_number: string,
    type: string,
    capacity: number,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function BatteryFormModal({ open, onClose, onSubmit }: BatteryFormModalProps) {
  const [serialNumber, setSerialNumber] = useState('');
  const [batteryType, setBatteryType] = useState<(typeof BATTERY_TYPES)[number]>('LiPo');
  const [capacity, setCapacity] = useState(10000);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSerialNumber('');
    setBatteryType('LiPo');
    setCapacity(10000);
    setLocalError('');
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError('');
    setSaving(true);

    const result = await onSubmit(serialNumber, batteryType, capacity);
    setSaving(false);

    if (result.ok) {
      onClose();
      return;
    }

    setLocalError(result.error ?? 'Не удалось добавить АКБ.');
  };

  return (
    <Modal open={open} onClose={onClose} title="Добавить новую АКБ">
      <form className="battery-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label className="form-field__label" htmlFor="battery-serial">
            Серийный номер
          </label>
          <input
            id="battery-serial"
            className="form-field__input"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="SN-9872"
            required
          />
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="battery-type">
            Тип АКБ
          </label>
          <AppSelect
            id="battery-type"
            value={batteryType}
            onChange={(v) => setBatteryType(String(v) as (typeof BATTERY_TYPES)[number])}
            options={BATTERY_TYPES.map((type) => ({ value: type, label: type }))}
          />
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="battery-capacity">
            Ёмкость, мАч
          </label>
          <input
            id="battery-capacity"
            className="form-field__input"
            type="number"
            min={1}
            step={1}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            required
          />
        </div>

        {localError && (
          <p className="battery-registry__error" role="alert">
            {localError}
          </p>
        )}

        <div className="battery-form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Сохранение…' : 'Добавить'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
