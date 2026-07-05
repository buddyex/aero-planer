import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, useSocket } from '../../context/AuthContext';
import { useApi } from '../../context/ApiContext';
import type { ChatContactRow, MessageRow } from '../../../shared/types/api.types';
import './CommsTerminal.css';

interface CommsTerminalProps {
  open: boolean;
  onClose: () => void;
  unreadSenderIds?: Set<number>;
  preselectContactId?: number | null;
  focusComposer?: boolean;
  onActiveContactChange?: (contactId: number | null) => void;
  onInboxRefresh?: () => void;
  onOpenProfile?: (contactId: number) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export function CommsTerminal({
  open,
  onClose,
  unreadSenderIds = new Set(),
  preselectContactId = null,
  focusComposer = false,
  onActiveContactChange,
  onInboxRefresh,
  onOpenProfile,
}: CommsTerminalProps) {
  const { user } = useAuth();
  const api = useApi();
  const { socket } = useSocket();
  const [contacts, setContacts] = useState<ChatContactRow[]>([]);
  const [activeContact, setActiveContact] = useState<ChatContactRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preselectAppliedRef = useRef<number | null>(null);

  const markContactAsRead = useCallback(
    async (contactId: number) => {
      try {
        await api.markDialogAsRead(contactId);
        onInboxRefresh?.();
      } catch {
        /* следующий poll */
      }
    },
    [onInboxRefresh, api],
  );

  const selectContact = useCallback(
    async (contact: ChatContactRow) => {
      setActiveContact(contact);
      onActiveContactChange?.(contact.id);
      await markContactAsRead(contact.id);
    },
    [markContactAsRead, onActiveContactChange],
  );

  const fetchContacts = useCallback(async (query: string) => {
    try {
      const result = await api.getUsersForChat(query);
      if (result?.ok && result.data) {
        setContacts(result.data);
        return result.data;
      }
    } catch {
      /* следующий poll / повторный поиск */
    }
    return [];
  }, [api]);

  const fetchMessages = useCallback(async () => {
    if (!user || !activeContact) return;
    try {
      const result = await api.getDialogMessages(user.id, activeContact.id);
      if (result?.ok && result.data) {
        setMessages(result.data);
        const hasUnreadFromPeer = result.data.some(
          (m) => m.sender_id === activeContact.id && m.is_read === 0,
        );
        if (hasUnreadFromPeer) {
          await markContactAsRead(activeContact.id);
        }
      }
    } catch {
      /* следующий poll */
    }
  }, [user, activeContact, markContactAsRead, api]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setActiveContact(null);
      onActiveContactChange?.(null);
      preselectAppliedRef.current = null;
      return;
    }
    if (!user) return;
    void fetchContacts(searchQuery);
  }, [open, user, fetchContacts]);

  useEffect(() => {
    if (!open || !user || preselectContactId == null) return;
    if (preselectAppliedRef.current === preselectContactId) return;

    const applyPreselect = async () => {
      const list = contacts.length > 0 ? contacts : await fetchContacts('');
      const target = list.find((c) => c.id === preselectContactId);
      if (target) {
        preselectAppliedRef.current = preselectContactId;
        await selectContact(target);
      }
    };

    void applyPreselect();
  }, [open, user, preselectContactId, contacts, fetchContacts, selectContact]);

  useEffect(() => {
    if (!open || !focusComposer || !activeContact) return;
    const timer = setTimeout(() => composerRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open, focusComposer, activeContact?.id]);

  useEffect(() => {
    if (!open || !user) return;

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      fetchContacts(searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, open, user, fetchContacts]);

  useEffect(() => {
    if (!open || !activeContact || !user) {
      setMessages([]);
      return;
    }

    fetchMessages();
  }, [open, activeContact?.id, user?.id, fetchMessages]);

  useEffect(() => {
    if (!socket || !open || !activeContact || !user) return;

    const onMessage = (msg: MessageRow) => {
      const isDialog =
        (msg.sender_id === user.id && msg.receiver_id === activeContact.id) ||
        (msg.sender_id === activeContact.id && msg.receiver_id === user.id);
      if (!isDialog) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.sender_id === activeContact.id) {
        void markContactAsRead(activeContact.id);
      }
    };

    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
    };
  }, [socket, open, activeContact, user, markContactAsRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!user || !activeContact || sending) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    try {
      const result = await api.sendMessage(user.id, activeContact.id, text);
      if (result?.ok) {
        setDraft('');
        await fetchMessages();
      }
    } catch {
      /* тихий fail */
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!open || !user) return null;

  return createPortal(
    <>
      <div className="comms-overlay" onClick={onClose} role="presentation" />
      <aside className="comms-drawer" role="dialog" aria-modal="true" aria-label="Терминал связи">
        <div className="comms-drawer__header">
          <h2 className="comms-drawer__title">Терминал связи</h2>
          <button
            type="button"
            className="comms-drawer__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="comms-drawer__body">
          <section className="comms-contacts">
            <div className="comms-contacts__search">
              <input
                type="search"
                placeholder="Поиск по ФИО или роли…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Поиск контактов"
              />
            </div>
            <div className="comms-contacts__list">
              {contacts.length === 0 ? (
                <p className="comms-contacts__empty">Контакты не найдены</p>
              ) : (
                contacts.map((contact) => {
                  const hasUnread = unreadSenderIds.has(contact.id);
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      className={`comms-contact${activeContact?.id === contact.id ? ' comms-contact--active' : ''}`}
                      onClick={() => void selectContact(contact)}
                    >
                      <span className="comms-contact__avatar-wrap">
                        <span className="comms-contact__avatar">{contact.full_name.charAt(0)}</span>
                        {hasUnread && (
                          <span className="comms-contact__unread" title="Непрочитанные сообщения" />
                        )}
                      </span>
                      <span className="comms-contact__info">
                        <span className="comms-contact__name">{contact.full_name}</span>
                        <span className="comms-contact__role">{contact.role}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className={`comms-dialog${!activeContact ? ' comms-dialog--empty' : ''}`}>
            {!activeContact ? (
              <p className="comms-dialog__placeholder">Выберите контакт для начала переписки</p>
            ) : (
              <>
                <header className="comms-dialog__header">
                  <button
                    type="button"
                    className="comms-dialog__peer-link"
                    onClick={() => onOpenProfile?.(activeContact.id)}
                    aria-label={`Открыть профиль: ${activeContact.full_name}`}
                  >
                    <span className="comms-dialog__peer-avatar">{activeContact.full_name.charAt(0)}</span>
                    <span className="comms-dialog__peer-info">
                      <span className="comms-dialog__peer-name">{activeContact.full_name}</span>
                      <span className="comms-dialog__peer-role">{activeContact.role}</span>
                      <span className="comms-dialog__peer-hint">Открыть профиль</span>
                    </span>
                    <span className="comms-dialog__peer-arrow" aria-hidden>
                      ◎
                    </span>
                  </button>
                </header>

                <div className="comms-dialog__messages">
                  {messages.length === 0 ? (
                    <p className="comms-dialog__empty">Нет сообщений. Напишите первым.</p>
                  ) : (
                    messages.map((msg) => {
                      const isOwn = msg.sender_id === user.id;
                      return (
                        <div
                          key={msg.id}
                          className={`comms-bubble${isOwn ? ' comms-bubble--own' : ' comms-bubble--peer'}`}
                        >
                          <p className="comms-bubble__text">{msg.text}</p>
                          <time className="comms-bubble__time" dateTime={msg.timestamp}>
                            {new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="comms-dialog__composer">
                  <input
                    ref={composerRef}
                    type="text"
                    className="comms-dialog__input"
                    placeholder="Введите сообщение…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    aria-label="Текст сообщения"
                  />
                  <button
                    type="button"
                    className="btn btn--accent"
                    onClick={() => void handleSend()}
                    disabled={sending || !draft.trim()}
                  >
                    Отправить
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </aside>
    </>,
    document.body,
  );
}
