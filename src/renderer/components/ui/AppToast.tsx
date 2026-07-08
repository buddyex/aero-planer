import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './AppToast.css';

export type AppToastVariant = 'success' | 'error' | 'info';

interface AppToastProps {
  message: string;
  onClose: () => void;
  variant?: AppToastVariant;
  durationMs?: number;
  showCountdown?: boolean;
}

export function AppToast({
  message,
  onClose,
  variant = 'success',
  durationMs = 4000,
  showCountdown = false,
}: AppToastProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [secondsLeft, setSecondsLeft] = useState(() => Math.ceil(durationMs / 1000));

  useEffect(() => {
    setSecondsLeft(Math.ceil(durationMs / 1000));
    const timer = window.setTimeout(() => onCloseRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);

  useEffect(() => {
    if (!showCountdown) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [message, durationMs, showCountdown]);

  const progressPct = showCountdown
    ? Math.max(0, Math.min(100, (secondsLeft / Math.ceil(durationMs / 1000)) * 100))
    : 0;

  return createPortal(
    <div
      className={`app-toast app-toast--${variant}${showCountdown ? ' app-toast--timed' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="app-toast__icon" aria-hidden>
        {variant === 'error' ? '⚠' : variant === 'info' ? 'ℹ' : '✓'}
      </span>
      <div className="app-toast__content">
        <p className="app-toast__text">{message}</p>
        {showCountdown && (
          <div className="app-toast__timer" aria-hidden>
            <div className="app-toast__timer-bar" style={{ width: `${progressPct}%` }} />
            <span className="app-toast__timer-label">{secondsLeft} с</span>
          </div>
        )}
      </div>
      <button type="button" className="app-toast__close" onClick={onClose} aria-label="Закрыть">
        ×
      </button>
    </div>,
    document.body,
  );
}
