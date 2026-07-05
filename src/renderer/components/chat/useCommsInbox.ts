import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../../context/ApiContext';
import { useSocket } from '../../context/AuthContext';

const PREVIEW_LEN = 50;

export interface CommsToast {
  id: string;
  messageId: string;
  senderId: number;
  senderName: string;
  preview: string;
}

function truncatePreview(text: string): string {
  if (text.length <= PREVIEW_LEN) return text;
  return `${text.slice(0, PREVIEW_LEN)}…`;
}

export function useCommsInbox(
  userId: number | undefined,
  commsOpen: boolean,
  activeContactId: number | null,
) {
  const api = useApi();
  const { socket } = useSocket();
  const [unreadSenderIds, setUnreadSenderIds] = useState<Set<number>>(new Set());
  const [toasts, setToasts] = useState<CommsToast[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      const result = await api.getUnreadMessages();
      if (!result?.ok || !result.data) return;

      const senderIds = new Set<number>();
      for (const msg of result.data) {
        senderIds.add(msg.sender_id);
      }
      setUnreadSenderIds(senderIds);

      for (const msg of result.data) {
        if (seenIdsRef.current.has(msg.id)) continue;
        seenIdsRef.current.add(msg.id);

        if (!bootstrappedRef.current) continue;

        const viewingSender = commsOpen && activeContactId === msg.sender_id;
        if (!viewingSender) {
          setToasts((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              messageId: msg.id,
              senderId: msg.sender_id,
              senderName: msg.sender_name,
              preview: truncatePreview(msg.text),
            },
          ]);
        }
      }

      bootstrappedRef.current = true;
    } catch {
      /* retry on next event */
    }
  }, [userId, commsOpen, activeContactId, api]);

  useEffect(() => {
    if (!userId) {
      setUnreadSenderIds(new Set());
      setToasts([]);
      seenIdsRef.current = new Set();
      bootstrappedRef.current = false;
      return;
    }

    refresh();
  }, [userId, refresh]);

  useEffect(() => {
    if (!socket || !userId) return;

    const onMessage = (msg: { id: string; sender_id: number; receiver_id: number; text: string; sender_name?: string }) => {
      if (msg.receiver_id !== userId) return;
      if (seenIdsRef.current.has(msg.id)) return;
      seenIdsRef.current.add(msg.id);

      setUnreadSenderIds((prev) => new Set(prev).add(msg.sender_id));

      const viewingSender = commsOpen && activeContactId === msg.sender_id;
      if (!viewingSender && bootstrappedRef.current) {
        setToasts((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            messageId: msg.id,
            senderId: msg.sender_id,
            senderName: msg.sender_name ?? 'Коллега',
            preview: truncatePreview(msg.text),
          },
        ]);
      }
    };

    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
    };
  }, [socket, userId, commsOpen, activeContactId]);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const hasUnread = unreadSenderIds.size > 0;

  return {
    unreadSenderIds,
    hasUnread,
    toasts,
    dismissToast,
    refresh,
  };
}
