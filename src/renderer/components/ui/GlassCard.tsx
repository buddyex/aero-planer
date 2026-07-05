import type { ReactNode } from 'react';
import './GlassCard.css';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  accent?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className = '', accent, onClick }: GlassCardProps) {
  return (
    <div
      className={`glass-card ${accent ? 'glass-card--accent' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
