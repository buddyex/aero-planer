import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import type { Mission } from '../../types';
import { formatMissionId } from '../../utils/missions';
import { canApproveMission, canRejectMission } from '../../utils/permissions';
import { formatDisplayTime } from '../../utils/weather';
import { Modal } from '../ui/Modal';
import { OperatorLink } from '../ui/OperatorLink';
import './MissionApprovalModal.css';

interface MissionApprovalModalProps {
  mission: Mission | null;
  open: boolean;
  onClose: () => void;
  onResolved?: () => void;
}

export function MissionApprovalModal({
  mission,
  open,
  onClose,
  onResolved,
}: MissionApprovalModalProps) {
  const { approveMission, rejectMission } = useAppData();
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!mission) return null;

  const canApprove = user ? canApproveMission(user.role) : false;
  const canReject = user ? canRejectMission(user.role) : false;

  const handleApprove = async () => {
    setError('');
    setSaving(true);
    const result = await approveMission(mission.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onResolved?.();
    onClose();
  };

  const handleReject = async () => {
    setError('');
    setSaving(true);
    const result = await rejectMission(mission.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onResolved?.();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Согласование миссии" wide>
      <div className="mission-approval">
        <div className="mission-approval__header">
          <h3 className="mission-approval__title">{mission.title}</h3>
          <span className="mission-approval__id">ID {formatMissionId(mission.id)}</span>
        </div>

        <dl className="mission-approval__grid">
          <div>
            <dt>Автор</dt>
            <dd>{mission.creator_name ?? '—'}</dd>
          </div>
          <div>
            <dt>Оператор</dt>
            <dd>
              <OperatorLink operatorId={mission.operator_id}>
                {mission.operator_name ?? '—'}
              </OperatorLink>
            </dd>
          </div>
          <div>
            <dt>Сектор</dt>
            <dd>{mission.sector_name ?? '—'}</dd>
          </div>
          <div>
            <dt>Борт</dt>
            <dd>
              {mission.drone_serial ?? '—'}
              {mission.drone_name ? ` (${mission.drone_name})` : ''}
            </dd>
          </div>
          <div>
            <dt>Начало</dt>
            <dd>{formatDisplayTime(mission.start_time)}</dd>
          </div>
          <div>
            <dt>Окончание</dt>
            <dd>{formatDisplayTime(mission.end_time)}</dd>
          </div>
        </dl>

        {(canApprove || canReject) && (
          <div className="mission-approval__actions">
            {canApprove && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={saving}
                onClick={handleApprove}
              >
                Утвердить
              </button>
            )}
            {canReject && (
              <button
                type="button"
                className="btn mission-approval__reject"
                disabled={saving}
                onClick={handleReject}
              >
                Отклонить
              </button>
            )}
          </div>
        )}

        {error && <p className="form-field__error">{error}</p>}
      </div>
    </Modal>
  );
}
