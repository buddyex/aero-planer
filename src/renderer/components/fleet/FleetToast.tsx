import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './FleetToast.css';

interface FleetToastProps {
  message: string;
  onClose: () => void;
  durationMs?: number;
}

/** Всплывающее уведомление об ошибке — не даёт UI «упасть» при отказе БД */
export function FleetToast({ message, onClose, durationMs = 6000 }: FleetToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [onClose, durationMs, message]);

  return createPortal(
    <div className="fleet-toast" role="alert" aria-live="assertive">
      <span className="fleet-toast__icon" aria-hidden>
        ⚠
      </span>
      <p className="fleet-toast__text">{message}</p>
      <button type="button" className="fleet-toast__close" onClick={onClose} aria-label="Закрыть">
        ×
      </button>
    </div>,
    document.body,
  );
}
