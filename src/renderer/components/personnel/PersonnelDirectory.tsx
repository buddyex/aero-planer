import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useApi } from '../../context/ApiContext';
import { useComms } from '../../context/CommsContext';
import type { ChatContactRow } from '../../../shared/types/api.types';
import { GlassCard } from '../ui/GlassCard';
import './PersonnelDirectory.css';

export function PersonnelDirectory() {
  const api = useApi();
  const { openComms } = useComms();
  const [contacts, setContacts] = useState<ChatContactRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadContacts = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const result = await api.getUsersForChat(query);
      if (result?.ok && result.data) {
        setContacts(result.data);
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadContacts(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadContacts]);

  return (
    <div className="personnel">
      <header className="personnel__header">
        <div>
          <h2 className="personnel__title">Коллеги</h2>
          <p className="personnel__desc">Справочник сотрудников — просмотр профилей и связь</p>
        </div>
        <input
          type="search"
          className="personnel__search"
          placeholder="Поиск по ФИО или роли…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Поиск коллег"
        />
      </header>

      {loading ? (
        <p className="personnel__loading">Загрузка…</p>
      ) : contacts.length === 0 ? (
        <GlassCard className="personnel__empty-card">
          <p>Коллеги не найдены</p>
        </GlassCard>
      ) : (
        <div className="personnel__grid">
          {contacts.map((contact) => (
            <GlassCard key={contact.id} className="personnel__card">
              <div className="personnel__card-top">
                <span className="personnel__avatar">{contact.full_name.charAt(0)}</span>
                <div className="personnel__info">
                  <p className="personnel__name">{contact.full_name}</p>
                  <p className="personnel__role">{contact.role}</p>
                  {contact.role === 'Оператор' && (
                    <span
                      className={`personnel__duty personnel__duty--${contact.duty_status === 'Свободен' ? 'free' : 'busy'}`}
                    >
                      {contact.duty_status}
                    </span>
                  )}
                </div>
              </div>
              <div className="personnel__actions">
                <Link to={`/profile/${contact.id}`} className="btn btn--secondary btn--sm">
                  Профиль
                </Link>
                <button
                  type="button"
                  className="btn btn--accent btn--sm"
                  onClick={() => openComms(contact.id, { focusComposer: true })}
                >
                  Написать
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
