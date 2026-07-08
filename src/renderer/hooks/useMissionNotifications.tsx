import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, useSocket } from '../context/AuthContext';
import { AppToast, type AppToastVariant } from '../components/ui/AppToast';
import '../components/ui/AppToast.css';

const MISSION_TOAST_DURATION_MS = 7000;

interface MissionToast {
  id: string;
  message: string;
  variant: AppToastVariant;
}

function toastVariantFromType(type?: string): AppToastVariant {
  if (type === 'error' || type === 'mission_rejected') return 'error';
  if (type === 'success' || type === 'mission_approved') return 'success';
  if (type === 'info' || type === 'mission_pending') return 'info';
  return 'success';
}

/** Push-уведомления о миссиях: руководителям — на согласование, операторам — решение. */
export function useMissionNotifications() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [toasts, setToasts] = useState<MissionToast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!socket || !user) return;

    const onNotify = (payload: { message?: string; type?: string }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [
        ...prev,
        {
          id,
          message: payload.message ?? 'Уведомление о миссии',
          variant: toastVariantFromType(payload.type),
        },
      ]);
    };

    socket.on('notification:toast', onNotify);
    return () => {
      socket.off('notification:toast', onNotify);
    };
  }, [socket, user]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="mission-toast-stack" aria-label="Уведомления о миссиях">
      {toasts.map((toast) => (
        <div key={toast.id} className="mission-toast-stack__item">
          <AppToast
            message={toast.message}
            variant={toast.variant}
            durationMs={MISSION_TOAST_DURATION_MS}
            showCountdown
            onClose={() => dismissToast(toast.id)}
          />
        </div>
      ))}
    </div>,
    document.body,
  );
}
