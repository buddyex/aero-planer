import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CommsToast } from './useCommsInbox';
import './MessageToastStack.css';

const TOAST_DURATION_MS = 5000;

interface MessageToastStackProps {
  toasts: CommsToast[];
  onDismiss: (toastId: string) => void;
  onToastClick?: (senderId: number) => void;
}

function MessageToastItem({
  toast,
  onDismiss,
  onToastClick,
}: {
  toast: CommsToast;
  onDismiss: (id: string) => void;
  onToastClick?: (senderId: number) => void;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismissRef.current(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id]);

  return (
    <div
      className="message-toast"
      role="status"
      aria-live="polite"
      onClick={() => onToastClick?.(toast.senderId)}
    >
      <span className="message-toast__avatar" aria-hidden="true">
        {toast.senderName.charAt(0)}
      </span>
      <div className="message-toast__body">
        <p className="message-toast__sender">{toast.senderName}</p>
        <p className="message-toast__preview">{toast.preview}</p>
      </div>
      <button
        type="button"
        className="message-toast__close"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        aria-label="Закрыть уведомление"
      >
        ×
      </button>
    </div>
  );
}

export function MessageToastStack({ toasts, onDismiss, onToastClick }: MessageToastStackProps) {
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="message-toast-stack" aria-label="Уведомления о сообщениях">
      {toasts.map((toast) => (
        <MessageToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onToastClick={onToastClick}
        />
      ))}
    </div>,
    document.body,
  );
}
