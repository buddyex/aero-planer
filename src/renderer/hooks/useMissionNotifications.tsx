import { useEffect, useState } from 'react';
import { useAuth, useSocket } from '../context/AuthContext';
import { AppToast } from '../components/ui/AppToast';

/** Push-уведомления для руководителей о новых миссиях на согласование. */
export function useMissionNotifications() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !user) return;
    const isManager = user.role === 'Руководитель' || user.role === 'Администратор';
    if (!isManager) return;

    const onNotify = (payload: { message?: string }) => {
      setToast(payload.message ?? 'Новая миссия ожидает согласования');
    };

    socket.on('notification:toast', onNotify);
    return () => {
      socket.off('notification:toast', onNotify);
    };
  }, [socket, user]);

  if (!toast) return null;

  return (
    <AppToast
      message={toast}
      variant="success"
      onClose={() => setToast(null)}
    />
  );
}
