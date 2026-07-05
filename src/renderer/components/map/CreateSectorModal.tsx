import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CreateSectorPayload } from '../../types';
import { formatBoundsHint, looksLikeSwappedCoords, validateSectorCoords } from '../../utils/geoBounds';
import { blurLeafletMaps, purgeOrphanModalNodes } from '../../utils/mapFocus';
import './CreateSectorModal.css';

interface CreateSectorModalProps {
  open: boolean;
  initialLat?: number;
  initialLon?: number;
  onClose: () => void;
  onSubmit: (payload: CreateSectorPayload) => Promise<{ ok: boolean; error?: string }>;
}

const DEFAULT_LAT = '56.8500';
const DEFAULT_LON = '53.2100';

export function CreateSectorModal({
  open,
  initialLat,
  initialLon,
  onClose,
  onSubmit,
}: CreateSectorModalProps) {
  const [name, setName] = useState('');
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lon, setLon] = useState(DEFAULT_LON);
  const [radius, setRadius] = useState('20');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = useCallback(() => {
    setName('');
    setError(null);
    blurLeafletMaps();
    onCloseRef.current();
    requestAnimationFrame(() => purgeOrphanModalNodes('.create-sector-modal'));
  }, []);

  useEffect(() => {
    if (!open) {
      requestAnimationFrame(() => purgeOrphanModalNodes('.create-sector-modal'));
      return;
    }

    setName('');
    setError(null);
    setLat(initialLat != null ? initialLat.toFixed(4) : DEFAULT_LAT);
    setLon(initialLon != null ? initialLon.toFixed(4) : DEFAULT_LON);
    setRadius('20');
  }, [open, initialLat, initialLon]);

  useLayoutEffect(() => {
    if (!open) return;

    blurLeafletMaps();
    nameInputRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      blurLeafletMaps();
    };
  }, [open, handleClose]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const latitude = Number(String(lat).replace(',', '.'));
    const longitude = Number(String(lon).replace(',', '.'));

    const validation = validateSectorCoords(latitude, longitude);
    if (!validation.ok) {
      setError(validation.message ?? 'Некорректные координаты.');
      return;
    }

    setSaving(true);

    try {
      const payload: CreateSectorPayload = {
        sector_name: name.trim(),
        center_lat: latitude,
        center_lon: longitude,
        radius_km: Number(radius),
      };

      const result = await onSubmit(payload);

      if (result.ok) {
        handleClose();
        return;
      }

      setError(result.error ?? 'Не удалось создать сектор.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="create-sector-modal" role="dialog" aria-modal="true" aria-labelledby="create-sector-title">
      <div
        className="create-sector-modal__backdrop"
        onClick={saving ? undefined : handleClose}
        aria-hidden
      />
      <form
        className="create-sector-modal__panel"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="create-sector-title" className="create-sector-modal__title">
          Новый сектор полётов
        </h3>
        <p className="create-sector-modal__hint">
          Укажите название и координаты ({formatBoundsHint()}). Можно кликнуть по карте.
          В KML/Google Earth порядок координат: <strong>долгота, широта</strong>.
        </p>

        <div className="form-field">
          <label className="form-field__label" htmlFor="sector-name">
            Название сектора
          </label>
          <input
            ref={nameInputRef}
            id="sector-name"
            className="form-field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Сектор Малая Пурга"
            required
            autoComplete="off"
          />
        </div>

        <div className="create-sector-modal__row">
          <div className="form-field">
            <label className="form-field__label" htmlFor="sector-lat">
              Широта (°)
            </label>
            <input
              id="sector-lat"
              type="text"
              inputMode="decimal"
              className="form-field__input"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="56.8500"
              required
              autoComplete="off"
            />
          </div>
          <div className="form-field">
            <label className="form-field__label" htmlFor="sector-lon">
              Долгота (°)
            </label>
            <input
              id="sector-lon"
              type="text"
              inputMode="decimal"
              className="form-field__input"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              placeholder="53.2100"
              required
              autoComplete="off"
            />
          </div>
        </div>

        {looksLikeSwappedCoords(Number(String(lat).replace(',', '.')), Number(String(lon).replace(',', '.'))) && (
          <p className="create-sector-modal__warn" role="status">
            Похоже, широта и долгота перепутаны. Широта: −90…90°, долгота: −180…180°. В KML порядок: долгота, широта.
          </p>
        )}

        <div className="form-field">
          <label className="form-field__label" htmlFor="sector-radius">
            Радиус зоны (км)
          </label>
          <input
            id="sector-radius"
            type="number"
            min="5"
            max="60"
            className="form-field__input"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="create-sector-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="create-sector-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={saving}>
            Отмена
          </button>
          <button type="submit" className="btn btn--accent" disabled={saving}>
            {saving ? 'Сохранение...' : 'Создать сектор'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
