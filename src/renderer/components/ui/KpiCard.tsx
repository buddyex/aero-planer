import { GlassCard } from './GlassCard';
import './KpiCard.css';

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  caption?: string;
}

export function KpiCard({ label, value, icon, variant = 'default', caption }: KpiCardProps) {
  return (
    <GlassCard className={`kpi-card kpi-card--${variant}${caption ? ' kpi-card--described' : ''}`}>
      <div className="kpi-card__icon">{icon}</div>
      <div className="kpi-card__content">
        <span className="kpi-card__value">{value}</span>
        <span className="kpi-card__label">{label}</span>
        {caption ? <span className="kpi-card__caption">{caption}</span> : null}
      </div>
    </GlassCard>
  );
}
