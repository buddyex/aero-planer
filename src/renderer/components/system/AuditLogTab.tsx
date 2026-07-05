import { useCallback, useEffect, useState } from 'react';
import type { AuditLogRow } from '../../../shared/types/api.types';
import { useApi } from '../../context/ApiContext';
import { GlassCard } from '../ui/GlassCard';

const PAGE_SIZE = 25;

function formatTs(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch {
    return value;
  }
}

function shortUuid(id: string): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function AuditLogTab() {
  const api = useApi();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api.getAuditLogsPage({
      limit: PAGE_SIZE,
      offset,
      search: search || undefined,
    });
    if (result.ok && result.data) {
      setRows(result.data.rows);
      setTotal(result.data.total);
    } else {
      setError(result.error ?? 'Не удалось загрузить журнал аудита.');
    }
    setLoading(false);
  }, [api, offset, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="system-center__section">
      <h3 className="system-center__section-title">Журнал аудита</h3>

      <div className="system-center__filters">
        <input
          type="search"
          placeholder="Поиск по действию…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setOffset(0);
              setSearch(searchInput.trim());
            }
          }}
        />
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            setOffset(0);
            setSearch(searchInput.trim());
          }}
        >
          Найти
        </button>
        {search ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setOffset(0);
            }}
          >
            Сбросить
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="system-error-log__error" role="alert">
          {error}
        </p>
      ) : null}

      <GlassCard>
        <div className="system-center__table-wrap">
          <table className="system-center__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Оператор</th>
                <th>Действие</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>Загрузка…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>Записей не найдено.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td title={row.id}>{shortUuid(row.id)}</td>
                    <td>{row.operator_name ?? '—'}</td>
                    <td>{row.action_text}</td>
                    <td>{formatTs(row.timestamp)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="system-center__pagination">
        <span>
          Всего: {total} · Страница {page} из {totalPages}
        </span>
        <div className="system-center__filters">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={offset <= 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Назад
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Вперёд
          </button>
        </div>
      </div>
    </section>
  );
}
