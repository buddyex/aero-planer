import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Sector } from '../../types';
import { blurLeafletMaps, purgeOrphanModalNodes } from '../../utils/mapFocus';
import { AppSelect } from '../ui/AppSelect';
import './ExportKmlModal.css';

interface ExportKmlModalProps {
  open: boolean;
  sectors: Sector[];
  onClose: () => void;
  onExport: (sectorId: number) => Promise<{ ok: boolean; error?: string }>;
}

export function ExportKmlModal({ open, sectors, onClose, onExport }: ExportKmlModalProps) {
  const [sectorId, setSectorId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      requestAnimationFrame(() => purgeOrphanModalNodes('.export-kml-modal'));
      return;
    }
    setError(null);
    setExporting(false);
    setSectorId(sectors[0] ? String(sectors[0].id) : '');
  }, [open, sectors]);

  const handleClose = useCallback(() => {
    setError(null);
    blurLeafletMaps();
    onCloseRef.current();
    requestAnimationFrame(() => purgeOrphanModalNodes('.export-kml-modal'));
  }, []);

  const handleExport = async () => {
    const id = Number(sectorId);
    if (!Number.isFinite(id) || id <= 0) {
      setError('Выберите сектор для экспорта.');
      return;
    }

    setError(null);
    setExporting(true);
    const result = await onExport(id);
    setExporting(false);

    if (result.ok) {
      handleClose();
      return;
    }

    if (result.error !== 'Экспорт отменён.') {
      setError(result.error ?? 'Не удалось экспортировать KML.');
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="export-kml-modal" role="dialog" aria-modal="true" aria-labelledby="export-kml-title">
      <div className="export-kml-modal__backdrop" onClick={handleClose} aria-hidden />
      <div className="export-kml-modal__panel" onMouseDown={(event) => event.stopPropagation()}>
        <h3 id="export-kml-title" className="export-kml-modal__title">
          Экспорт сектора в KML
        </h3>
        <p className="export-kml-modal__hint">Выберите активный сектор для выгрузки границ в файл KML.</p>

        <div className="form-field">
          <label className="form-field__label" htmlFor="export-kml-sector">
            Сектор
          </label>
          <AppSelect
            id="export-kml-sector"
            value={sectorId}
            onChange={setSectorId}
            disabled={sectors.length === 0 || exporting}
            placeholder="Нет доступных секторов"
            options={sectors.map((sector) => ({
              value: sector.id,
              label: sector.sector_name,
            }))}
          />
        </div>

        {error && (
          <p className="export-kml-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="export-kml-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={exporting}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--accent"
            onClick={handleExport}
            disabled={exporting || sectors.length === 0}
          >
            {exporting ? 'Экспорт…' : 'Экспорт'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
