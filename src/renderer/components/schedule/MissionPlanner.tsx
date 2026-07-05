import { useCallback, useEffect, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import type { Mission } from '../../types';
import { canCreateMissions } from '../../utils/permissions';
import { AppToast } from '../ui/AppToast';
import { CreateMissionModal } from './CreateMissionModal';
import { GanttChart } from './GanttChart';
import { MissionDetailModal } from './MissionDetailModal';
import { MissionRegistry } from './MissionRegistry';
import './MissionPlanner.css';

export function MissionPlanner() {
  const { visibleMissions, refreshAppData } = useAppData();
  const { user } = useAuth();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editMission, setEditMission] = useState<Mission | null>(null);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reportToast, setReportToast] = useState<{ id: number; message: string } | null>(null);

  const canCreate = user ? canCreateMissions(user.role) : false;

  const handleReportSaved = useCallback(() => {
    setReportToast({ id: Date.now(), message: 'Отчет успешно сохранен' });
  }, []);

  useEffect(() => {
    refreshAppData();
  }, [refreshAppData]);

  useEffect(() => {
    if (!selectedMission) return;
    const fresh = visibleMissions.find((mission) => mission.id === selectedMission.id);
    if (fresh) {
      setSelectedMission(fresh);
    }
  }, [visibleMissions, selectedMission]);

  const openMissionDetail = (mission: Mission) => {
    setSelectedMission(mission);
    setDetailOpen(true);
  };

  const closeMissionDetail = () => {
    setDetailOpen(false);
    setSelectedMission(null);
  };

  const handleEditMission = (mission: Mission) => {
    setEditMission(mission);
    setDetailOpen(false);
  };

  const closeEditModal = () => {
    setEditMission(null);
    setSelectedMission(null);
  };

  return (
    <div className="mission-planner">
      <header className="mission-planner__header">
        <div>
          <h2 className="mission-planner__title">Расписание миссий</h2>
          <p className="mission-planner__desc">
            Интерактивная диаграмма Ганта с индикацией погодного риска по сектору. Нажмите на
            миссию в таймлайне или реестре для управления статусом.
          </p>
        </div>
        {canCreate && (
          <button type="button" className="btn btn--primary" onClick={() => setCreateModalOpen(true)}>
            + Создать миссию
          </button>
        )}
      </header>

      <GanttChart onMissionClick={openMissionDetail} />

      <MissionRegistry onSelectMission={openMissionDetail} />

      {canCreate && (
        <CreateMissionModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
      )}

      {canCreate && (
        <CreateMissionModal
          open={Boolean(editMission)}
          mission={editMission}
          onClose={closeEditModal}
        />
      )}

      <MissionDetailModal
        mission={selectedMission}
        open={detailOpen}
        onClose={closeMissionDetail}
        onReportSaved={handleReportSaved}
        onEdit={canCreate ? handleEditMission : undefined}
      />

      {reportToast && (
        <AppToast
          key={reportToast.id}
          message={reportToast.message}
          onClose={() => setReportToast(null)}
          variant="success"
        />
      )}
    </div>
  );
}
