import { useCallback, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import type { RiskLevel } from '../../types';
import { canEditSectorBoundaries } from '../../utils/permissions';
import { formatMetric } from '../../utils/weather';
import { prepareForNativeDialog, restorePageInput } from '../../utils/mapFocus';
import { GlassCard } from '../ui/GlassCard';
import { ExportKmlModal } from './ExportKmlModal';
import './SectorGrid.css';

function riskClass(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    Низкий: 'sector-card--low',
    Средний: 'sector-card--medium',
    Высокий: 'sector-card--high',
  };
  return map[level];
}

export function SectorGrid() {
  const { sectors, hasBackend, deleteSector, exportSectorsKml } = useAppData();
  const { user } = useAuth();

  const canManageSectors = Boolean(user && canEditSectorBoundaries(user.role) && hasBackend);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const handleDelete = async (sectorId: number, sectorName: string) => {
    prepareForNativeDialog();

    if (!window.confirm(`Вы уверены, что хотите удалить сектор «${sectorName}»?`)) {
      restorePageInput();
      return;
    }

    setActionError(null);
    setActionInfo(null);
    setExportModalOpen(false);

    const result = await deleteSector(sectorId);
    if (!result.ok) {
      setActionError(result.error ?? 'Не удалось удалить сектор.');
      restorePageInput();
      return;
    }

    setActionInfo(`Сектор «${sectorName}» удалён.`);
    restorePageInput();
  };

  const handleExport = useCallback(
    async (sectorId: number) => {
      const result = await exportSectorsKml(sectorId);
      if (result.ok) {
        setActionInfo(result.message ?? 'KML экспортирован.');
        return { ok: true };
      }
      return { ok: false, error: result.error };
    },
    [exportSectorsKml],
  );

  return (
    <div className="sector-grid">
      <div className="sector-grid__header">
        <div className="sector-grid__header-main">
          <h2 className="section-title">Секторы мониторинга</h2>
          <p className="section-subtitle">Цвет обновляется после обработки метеофайла</p>
        </div>
        {canManageSectors && (
          <button
            type="button"
            className="btn btn--ghost sector-grid__export-btn"
            onClick={() => {
              setActionError(null);
              setExportModalOpen(true);
            }}
            disabled={sectors.length === 0}
          >
            Экспорт KML
          </button>
        )}
      </div>

      {actionError && (
        <p className="sector-grid__message sector-grid__message--error" role="alert">
          {actionError}
        </p>
      )}
      {actionInfo && (
        <p className="sector-grid__message sector-grid__message--info" role="status">
          {actionInfo}
        </p>
      )}

      {sectors.length === 0 ? (
        <p className="sector-grid__empty">Секторы не созданы. Создайте зону на карте в разделе «Дашборд».</p>
      ) : (
        <div className="sector-grid__cards">
          {sectors.map((sector) => (
            <GlassCard
              key={sector.id}
              className={`sector-card ${riskClass(sector.risk_level)}`}
            >
              <div className="sector-card__indicator" />
              <div className="sector-card__content">
                <h3 className="sector-card__name">{sector.sector_name}</h3>
                <span className="sector-card__risk">{sector.risk_level} риск</span>
                <div className="sector-card__metrics">
                  <div className="sector-card__metric">
                    <span className="sector-card__metric-label">Ветер</span>
                    <span className="sector-card__metric-value">
                      {formatMetric(sector.wind_speed)} м/с
                    </span>
                  </div>
                  <div className="sector-card__metric">
                    <span className="sector-card__metric-label">Темп.</span>
                    <span className="sector-card__metric-value">
                      {formatMetric(sector.temperature)} °C
                    </span>
                  </div>
                  <div className="sector-card__metric">
                    <span className="sector-card__metric-label">Осадки</span>
                    <span className="sector-card__metric-value">
                      {sector.precipitation ?? '—'}
                    </span>
                  </div>
                </div>
                {canManageSectors && (
                  <button
                    type="button"
                    className="sector-card__delete btn btn--ghost"
                    onClick={() => handleDelete(sector.id, sector.sector_name)}
                  >
                    Удалить сектор
                  </button>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <ExportKmlModal
        open={exportModalOpen}
        sectors={sectors}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExport}
      />
    </div>
  );
}
