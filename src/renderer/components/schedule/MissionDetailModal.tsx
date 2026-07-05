import { useEffect, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../context/ApiContext';
import type { Mission, MissionStatus } from '../../types';
import {
  evaluateMissionWeatherRisk,
  logBlockedLaunchAttempt,
  type MissionWeatherRisk,
} from '../../utils/missionWeatherRisk';
import { formatMissionId, getOperatorAssignmentStatus, MISSION_TRANSITION_LABEL, missionStatusClass } from '../../utils/missions';
import {
  canDownloadFlightSheet,
  canEditMission,
  canTransitionMissionStatus,
  getAllowedMissionTransitions,
} from '../../utils/permissions';
import { formatDisplayTime } from '../../utils/weather';
import { Modal } from '../ui/Modal';
import { OperatorLink } from '../ui/OperatorLink';
import { RiskAssessmentBlock } from './RiskAssessmentBlock';
import './MissionDetailModal.css';

interface MissionDetailModalProps {
  mission: Mission | null;
  open: boolean;
  onClose: () => void;
  onReportSaved?: () => void;
  onEdit?: (mission: Mission) => void;
}

const STATUS_LABELS: Record<MissionStatus, string> = {
  'Ожидает утверждения': 'Ожидает утверждения',
  'К выполнению': 'К выполнению',
  Выполняется: 'Выполняется',
  Завершено: 'Завершено',
  Отменено: 'Отменено',
  Отклонено: 'Отклонено',
};

export function MissionDetailModal({ mission, open, onClose, onReportSaved, onEdit }: MissionDetailModalProps) {
  const { getDroneById, getSectorById, getOperatorById, updateMissionStatus } = useAppData();
  const { user } = useAuth();
  const api = useApi();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [kmlLoading, setKmlLoading] = useState(false);
  const [weatherRisk, setWeatherRisk] = useState<MissionWeatherRisk>({
    level: 'unknown',
    message: '',
    windBlocked: false,
  });

  const drone = mission ? getDroneById(mission.drone_id) : undefined;
  const sector = mission ? getSectorById(mission.sector_id) : undefined;
  const operator = mission ? getOperatorById(mission.operator_id) : undefined;

  useEffect(() => {
    if (!mission || mission.status !== 'К выполнению') {
      setWeatherRisk({ level: 'unknown', message: '', windBlocked: false });
      return;
    }

    const risk = evaluateMissionWeatherRisk(
      sector?.wind_speed,
      drone?.max_wind_speed,
      sector?.precipitation,
    );
    setWeatherRisk(risk);
  }, [mission, drone?.max_wind_speed, sector?.wind_speed, sector?.precipitation]);

  if (!mission) return null;

  const operatorAssignmentStatus = getOperatorAssignmentStatus(mission);
  const canDownloadReport = user
    ? canDownloadFlightSheet(user.role, user.id, mission.operator_id, mission.status)
    : false;
  const transitions = getAllowedMissionTransitions(mission.status);
  const allowedTransitions = user
    ? transitions.filter((status) =>
        canTransitionMissionStatus(user.role, user.id, mission.operator_id, status),
      )
    : [];
  const canEdit =
    user && canEditMission(user.role, mission.status) && Boolean(onEdit);
  const primaryTransitions = allowedTransitions.filter((status) => status !== 'Отменено');
  const canCancel = allowedTransitions.includes('Отменено');
  const showMissionActions = canEdit || primaryTransitions.length > 0 || canCancel;

  const handleStatusChange = async (newStatus: MissionStatus) => {
    setError('');

    if (newStatus === 'Выполняется' && weatherRisk.windBlocked) {
      setError(weatherRisk.message);
      await logBlockedLaunchAttempt(drone?.name ?? mission.drone_name ?? 'БПЛА', user?.id);
      return;
    }

    setSaving(true);
    const result = await updateMissionStatus(mission.id, newStatus);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (newStatus === 'Завершено' || newStatus === 'Отменено') {
      onClose();
    }
  };

  const handleExportKml = async () => {
    if (kmlLoading) return;
    setError('');
    setKmlLoading(true);
    try {
      const result = await api.exportMissionKml(mission.id);
      if (!result.ok && result.error !== 'CANCELLED') {
        setError(result.message ?? result.error ?? 'Не удалось экспортировать KML.');
      }
    } finally {
      setKmlLoading(false);
    }
  };

  const handleDownloadFlightSheet = async () => {
    if (!user || pdfLoading || !canDownloadReport) return;

    setError('');
    setPdfLoading(true);

    try {
      if (!api.downloadFlightSheetPdf) {
        setError('PDF недоступен.');
        return;
      }
      const result = await api.downloadFlightSheetPdf(mission.id);
      if (result.ok) {
        onReportSaved?.();
      } else {
        setError(result.error ?? 'Не удалось сформировать полётный лист.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сформировать полётный лист.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={mission.title} wide>
      <div className="mission-detail">
        <div className="mission-detail__status-row">
          <span className={`mission-detail__status mission-status ${missionStatusClass(mission.status)}`}>
            {STATUS_LABELS[mission.status]}
          </span>
          <span className="mission-detail__id" title={mission.id}>
            ID {formatMissionId(mission.id)}
          </span>
        </div>

        <dl className="mission-detail__grid">
          <div className="mission-detail__field">
            <dt>Оператор</dt>
            <dd>
              {mission.operator_id ? (
                <OperatorLink operatorId={mission.operator_id} className="operator-link">
                  {mission.operator_name ?? operator?.full_name ?? '—'}
                </OperatorLink>
              ) : (
                mission.operator_name ?? operator?.full_name ?? '—'
              )}
              {operator?.role === 'Оператор' && operatorAssignmentStatus
                ? ` · ${operatorAssignmentStatus}`
                : operator?.role === 'Оператор' && operator.duty_status
                  ? ` · ${operator.duty_status}`
                  : ''}
            </dd>
          </div>
          <div className="mission-detail__field">
            <dt>Борт БПЛА</dt>
            <dd>
              {mission.drone_serial ?? drone?.serial_number ?? '—'}
              {mission.drone_name || drone?.name ? ` (${mission.drone_name ?? drone?.name})` : ''}
            </dd>
          </div>
          <div className="mission-detail__field">
            <dt>Сектор</dt>
            <dd>
              {mission.sector_name ?? sector?.sector_name ?? '—'}
              {(mission.sector_risk_level ?? sector?.risk_level)
                ? ` · риск: ${mission.sector_risk_level ?? sector?.risk_level}`
                : ''}
            </dd>
          </div>
          <div className="mission-detail__field">
            <dt>Начало</dt>
            <dd>{formatDisplayTime(mission.start_time)}</dd>
          </div>
          <div className="mission-detail__field">
            <dt>Окончание</dt>
            <dd>{formatDisplayTime(mission.end_time)}</dd>
          </div>
        </dl>

        {canDownloadReport && (
          <div className="mission-detail__documents">
            <p className="mission-detail__actions-title">Документы</p>
            <div className="mission-detail__documents-row">
              <button
                type="button"
                className="btn btn--secondary mission-detail__doc-btn"
                disabled={pdfLoading || saving}
                onClick={handleDownloadFlightSheet}
                title="Скачать PDF-отчёт по миссии"
              >
                {pdfLoading ? (
                  <>
                    <span className="mission-detail__pdf-spinner" aria-hidden />
                    Формирование PDF...
                  </>
                ) : (
                  <>
                    <PdfIcon />
                    Скачать полётный лист
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn--secondary mission-detail__doc-btn"
                disabled={kmlLoading || saving}
                onClick={handleExportKml}
                title="Экспорт сектора и маршрута в KML"
              >
                {kmlLoading ? 'Экспорт KML…' : 'Экспорт KML'}
              </button>
            </div>
          </div>
        )}

        {!canDownloadReport && mission.status !== 'Завершено' && mission.status !== 'Отменено' && mission.status !== 'Отклонено' && (
          <p className="mission-detail__readonly">
            Полётный лист и KML будут доступны после завершения миссии.
          </p>
        )}

        {!canDownloadReport && mission.status === 'Завершено' && user?.role === 'Оператор' && user.id !== mission.operator_id && (
          <p className="mission-detail__readonly">
            Скачивание документов доступно только администратору, руководителю или назначенному оператору.
          </p>
        )}

        {!canDownloadReport && user?.role === 'Оператор' && user.id === mission.operator_id && (mission.status === 'Отменено' || mission.status === 'Отклонено') && (
          <p className="mission-detail__readonly">
            Документы недоступны для отменённой или отклонённой миссии.
          </p>
        )}

        {mission.status === 'К выполнению' && (
          <RiskAssessmentBlock risk={weatherRisk} />
        )}

        {showMissionActions && (
          <div className="mission-detail__actions-row">
            <div className="mission-detail__actions-left">
              {canEdit && (
                <button
                  type="button"
                  className="btn btn--secondary mission-detail__btn"
                  disabled={saving}
                  onClick={() => onEdit?.(mission)}
                >
                  Редактировать миссию
                </button>
              )}
              {primaryTransitions.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`btn btn--primary mission-detail__btn mission-detail__btn--${statusClassSuffix(status)}`}
                  disabled={saving || (status === 'Выполняется' && weatherRisk.windBlocked)}
                  onClick={() => handleStatusChange(status)}
                >
                  {MISSION_TRANSITION_LABEL[status] ?? status}
                </button>
              ))}
            </div>
            {canCancel && (
              <button
                type="button"
                className="btn mission-detail__btn mission-detail__btn--cancel"
                disabled={saving}
                onClick={() => handleStatusChange('Отменено')}
              >
                Отменить миссию
              </button>
            )}
          </div>
        )}

        {allowedTransitions.length === 0 && transitions.length > 0 && !canEdit && (
          <p className="mission-detail__readonly">
            {user?.role === 'Руководитель' || user?.role === 'Администратор'
              ? 'Запуск и завершение миссии выполняет только назначенный оператор.'
              : 'Изменение статуса доступно только назначенному оператору.'}
          </p>
        )}

        {error && <p className="form-field__error">{error}</p>}
      </div>
    </Modal>
  );
}

function statusClassSuffix(status: MissionStatus): string {
  switch (status) {
    case 'Выполняется':
      return 'start';
    case 'Завершено':
      return 'complete';
    case 'Отменено':
      return 'cancel';
    default:
      return 'default';
  }
}

function PdfIcon() {
  return (
    <svg
      className="mission-detail__pdf-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path
        d="M9 13h1.5v4H9v-4Zm3.2 0h1.3c1.2 0 2 .7 2 1.8 0 1.1-.8 1.9-2 1.9h-1.3v-3.7Zm1.3 3c.5 0 .8-.3.8-.8 0-.5-.3-.8-.8-.8h-.2v1.6h.2Z"
        fill="currentColor"
      />
    </svg>
  );
}
