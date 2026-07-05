import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { IntegrityCheck } from '../../../shared/types/api.types';
import { useApi } from '../../context/ApiContext';
import { GlassCard } from '../ui/GlassCard';

export function IntegrityTab() {
  const api = useApi();
  const [checks, setChecks] = useState<IntegrityCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api.getIntegrityReport();
    if (result.ok && result.data) {
      setChecks(result.data.checks);
    } else {
      setError(result.error ?? 'Не удалось загрузить отчёт целостности.');
    }
    setLoading(false);
  }, [api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <p className="system-center__loading">Проверка целостности данных…</p>;
  }

  if (error) {
    return (
      <p className="system-error-log__error" role="alert">
        {error}
      </p>
    );
  }

  const issueCount = checks.filter((c) => c.severity !== 'ok').length;

  return (
    <section className="system-center__section">
      <div className="system-center__header">
        <div>
          <h3 className="system-center__section-title">
            <ShieldCheck size={18} aria-hidden />
            Целостность данных
          </h3>
          <p className="system-center__desc">
            {issueCount === 0
              ? 'Критических расхождений не обнаружено.'
              : `Обнаружено проверок с замечаниями: ${issueCount}.`}
          </p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={() => void loadData()}>
          Обновить
        </button>
      </div>

      <div className="system-center__integrity-grid">
        {checks.map((check) => (
          <GlassCard key={check.id} className="system-center__integrity-card">
            <div className="system-center__integrity-header">
              <h4 className="system-center__integrity-title">{check.title}</h4>
              <span className={`system-center__badge system-center__badge--${check.severity}`}>
                {check.count}
              </span>
            </div>
            <p className="system-center__integrity-detail">{check.detail}</p>
            {check.items.length > 0 ? (
              <>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [check.id]: !prev[check.id] }))
                  }
                >
                  {expanded[check.id] ? 'Скрыть детали' : `Показать (${check.items.length})`}
                </button>
                {expanded[check.id] ? (
                  <div className="system-center__integrity-items">
                    {check.items.map((item) => (
                      <div key={`${check.id}-${item.id}`} className="system-center__integrity-item">
                        <span>{item.label}</span>
                        {item.meta ? (
                          <span className="system-center__integrity-meta">{String(item.meta)}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="system-center__integrity-detail">Проблем не обнаружено.</p>
            )}
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
