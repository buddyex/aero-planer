import { useEffect, useState, type FormEvent } from 'react';
import type { Battery } from '../../types';
import { Modal } from '../ui/Modal';
import './BatteryRegistry.css';

export interface BatteryInspectionFormPayload {
  visual_ok: boolean;
  connectors_ok: boolean;
  balance_ok: boolean;
  test_cycle_ok: boolean;
  capacity_percent: number;
  result: 'Пройдена' | 'Не пройдена';
  notes: string;
}

interface BatteryInspectionModalProps {
  open: boolean;
  battery: Battery | null;
  onClose: () => void;
  onSubmit: (payload: BatteryInspectionFormPayload) => Promise<{ ok: boolean; error?: string }>;
}

const CHECKLIST_ITEMS = [
  {
    key: 'visual_ok' as const,
    label: 'Визуальный осмотр',
    hint: 'Нет вздутия, трещин, следов перегрева, деформации корпуса.',
  },
  {
    key: 'connectors_ok' as const,
    label: 'Разъёмы и контакты',
    hint: 'Нет окисления, люфта, оплавления; фиксация надёжная.',
  },
  {
    key: 'balance_ok' as const,
    label: 'Балансировка ячеек',
    hint: 'Разброс напряжений ячеек в норме (≤ 0,05 В между ячейками).',
  },
  {
    key: 'test_cycle_ok' as const,
    label: 'Тестовый цикл',
    hint: 'Контрольный заряд/разряд без аномального нагрева и сбоев BMS.',
  },
];

export function BatteryInspectionModal({
  open,
  battery,
  onClose,
  onSubmit,
}: BatteryInspectionModalProps) {
  const [checks, setChecks] = useState({
    visual_ok: false,
    connectors_ok: false,
    balance_ok: false,
    test_cycle_ok: false,
  });
  const [capacityPercent, setCapacityPercent] = useState(85);
  const [result, setResult] = useState<'Пройдена' | 'Не пройдена'>('Пройдена');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setChecks({
      visual_ok: false,
      connectors_ok: false,
      balance_ok: false,
      test_cycle_ok: false,
    });
    setCapacityPercent(85);
    setResult('Пройдена');
    setNotes('');
    setLocalError('');
  }, [open, battery?.id]);

  if (!battery) return null;

  const minCapacityMah = Math.round(battery.capacity * 0.8);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError('');
    setSaving(true);

    const response = await onSubmit({
      ...checks,
      capacity_percent: capacityPercent,
      result,
      notes,
    });

    setSaving(false);
    if (response.ok) {
      onClose();
      return;
    }
    setLocalError(response.error ?? 'Не удалось завершить проверку.');
  };

  return (
    <Modal open={open} onClose={onClose} title="Плановая проверка АКБ">
      <form className="battery-inspection" onSubmit={handleSubmit}>
        <div className="battery-inspection__summary">
          <p>
            <strong>{battery.serial_number}</strong> — {battery.type},{' '}
            {battery.capacity.toLocaleString('ru-RU')} мАч
          </p>
          <p>
            Текущий цикл: <strong>{battery.cycle_count}</strong> (порог проверки каждые 50 циклов)
          </p>
        </div>

        <p className="battery-inspection__hint">
          Выполните физическую проверку по чек-листу, затем зафиксируйте результат в системе. При
          «Пройдена» АКБ вернётся в пул; при «Не пройдена» — будет списана.
        </p>

        <fieldset className="battery-inspection__checklist">
          <legend className="battery-inspection__legend">Чек-лист проверки</legend>
          {CHECKLIST_ITEMS.map((item) => (
            <label key={item.key} className="battery-inspection__check">
              <input
                type="checkbox"
                checked={checks[item.key]}
                onChange={(e) =>
                  setChecks((prev) => ({ ...prev, [item.key]: e.target.checked }))
                }
              />
              <span>
                <span className="battery-inspection__check-label">{item.label}</span>
                <span className="battery-inspection__check-hint">{item.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="form-field">
          <label className="form-field__label" htmlFor="battery-capacity-percent">
            Фактическая ёмкость, %
          </label>
          <input
            id="battery-capacity-percent"
            className="form-field__input"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={capacityPercent}
            onChange={(e) => setCapacityPercent(Number(e.target.value))}
            required
          />
          <span className="form-field__hint">
            Минимум 80% от номинала (≥ {minCapacityMah.toLocaleString('ru-RU')} мАч)
          </span>
        </div>

        <fieldset className="battery-inspection__result">
          <legend className="battery-inspection__legend">Заключение</legend>
          <label className="battery-inspection__radio">
            <input
              type="radio"
              name="inspection-result"
              value="Пройдена"
              checked={result === 'Пройдена'}
              onChange={() => setResult('Пройдена')}
            />
            Пройдена — допустить к эксплуатации
          </label>
          <label className="battery-inspection__radio">
            <input
              type="radio"
              name="inspection-result"
              value="Не пройдена"
              checked={result === 'Не пройдена'}
              onChange={() => setResult('Не пройдена')}
            />
            Не пройдена — списать АКБ
          </label>
        </fieldset>

        <div className="form-field">
          <label className="form-field__label" htmlFor="battery-inspection-notes">
            Комментарий{result === 'Не пройдена' ? ' *' : ''}
          </label>
          <textarea
            id="battery-inspection-notes"
            className="form-field__input battery-inspection__textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Замечания по результатам проверки..."
            required={result === 'Не пройдена'}
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
            {saving ? 'Сохранение…' : 'Завершить проверку'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
