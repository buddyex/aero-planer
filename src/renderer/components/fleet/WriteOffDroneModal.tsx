import { useEffect, useState, type FormEvent } from 'react';
import type { Drone } from '../../types';
import { Modal } from '../ui/Modal';
import './WriteOffDroneModal.css';

interface WriteOffDroneModalProps {
  open: boolean;
  drone: Drone | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<{ ok: boolean; error?: string }>;
}

export function WriteOffDroneModal({ open, drone, onClose, onConfirm }: WriteOffDroneModalProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError('');
    setSaving(false);
  }, [open, drone?.id]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!drone) return;
    setError('');
    setSaving(true);
    const result = await onConfirm(reason.trim());
    setSaving(false);
    if (result.ok) {
      onClose();
      return;
    }
    setError(result.error ?? 'Не удалось списать борт.');
  };

  return (
    <Modal open={open} onClose={onClose} title="Списание борта">
      <form className="writeoff-form" onSubmit={handleSubmit}>
        <p className="writeoff-form__lead">
          Борт <strong>{drone?.name}</strong> ({drone?.serial_number}) будет переведён в статус «Списан» и
          исключён из назначения на миссии и ТО. Записи в расписании сохранятся.
        </p>

        <div className="form-field">
          <label className="form-field__label" htmlFor="writeoff-reason">
            Причина списания
          </label>
          <textarea
            id="writeoff-reason"
            className="form-field__input writeoff-form__reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Например: выработка ресурса, авария, замена модели…"
            rows={3}
            maxLength={512}
            disabled={saving}
          />
        </div>

        {error && <p className="form-field__error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="submit" className="btn btn--danger" disabled={saving || !drone}>
            {saving ? 'Списание…' : 'Списать борт'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
