import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './AppToast.css';

export type AppToastVariant = 'success' | 'error';

interface AppToastProps {
  message: string;
  onClose: () => void;
  variant?: AppToastVariant;
  durationMs?: number;
}

export function AppToast({
  message,
  onClose,
  variant = 'success',
  durationMs = 4000,
}: AppToastProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);

  return createPortal(
    <div
      className={`app-toast app-toast--${variant}`}
      role="status"
      aria-live="polite"
    >
      <span className="app-toast__icon" aria-hidden>
        {variant === 'success' ? '✓' : '⚠'}
      </span>
      <p className="app-toast__text">{message}</p>
      <button type="button" className="app-toast__close" onClick={onClose} aria-label="Закрыть">
        ×
      </button>
    </div>,
    document.body,
  );
}
