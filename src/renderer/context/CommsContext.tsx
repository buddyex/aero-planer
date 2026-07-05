import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { CommsTerminal } from '../components/chat/CommsTerminal';
import { MessageToastStack } from '../components/chat/MessageToastStack';
import { useCommsInbox } from '../components/chat/useCommsInbox';
import { useAuth } from './AuthContext';

interface CommsContextValue {
  openComms: (contactId?: number, options?: { focusComposer?: boolean }) => void;
  closeComms: () => void;
  openProfileFromComms: (contactId: number) => void;
  isOpen: boolean;
  hasUnread: boolean;
}

const CommsContext = createContext<CommsContextValue | null>(null);

export function CommsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [commsOpen, setCommsOpen] = useState(false);
  const [activeCommsContactId, setActiveCommsContactId] = useState<number | null>(null);
  const [preselectContactId, setPreselectContactId] = useState<number | null>(null);
  const [focusComposer, setFocusComposer] = useState(false);

  const inbox = useCommsInbox(user?.id, commsOpen, activeCommsContactId);

  const closeComms = useCallback(() => {
    setCommsOpen(false);
    setActiveCommsContactId(null);
    setPreselectContactId(null);
    setFocusComposer(false);
  }, []);

  const openComms = useCallback((contactId?: number, options?: { focusComposer?: boolean }) => {
    if (contactId != null) {
      setPreselectContactId(contactId);
    }
    setFocusComposer(options?.focusComposer ?? contactId != null);
    setCommsOpen(true);
  }, []);

  const openProfileFromComms = useCallback(
    (contactId: number) => {
      closeComms();
      navigate(`/profile/${contactId}`);
    },
    [closeComms, navigate],
  );

  const value = useMemo(
    () => ({
      openComms,
      closeComms,
      openProfileFromComms,
      isOpen: commsOpen,
      hasUnread: inbox.hasUnread,
    }),
    [openComms, closeComms, openProfileFromComms, commsOpen, inbox.hasUnread],
  );

  return (
    <CommsContext.Provider value={value}>
      {children}
      <CommsTerminal
        open={commsOpen}
        onClose={closeComms}
        unreadSenderIds={inbox.unreadSenderIds}
        preselectContactId={preselectContactId}
        focusComposer={focusComposer}
        onActiveContactChange={setActiveCommsContactId}
        onInboxRefresh={inbox.refresh}
        onOpenProfile={openProfileFromComms}
      />
      <MessageToastStack
        toasts={inbox.toasts}
        onDismiss={inbox.dismissToast}
        onToastClick={(senderId) => openComms(senderId)}
      />
    </CommsContext.Provider>
  );
}

export function useComms(): CommsContextValue {
  const ctx = useContext(CommsContext);
  if (!ctx) {
    throw new Error('useComms must be used within CommsProvider');
  }
  return ctx;
}
