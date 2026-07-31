import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

/** Unified premium surface for all dashboard / HUD cards. */
export const premiumSurfaceClass = cn(
  'bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] shadow-[var(--glass-shadow)] rounded-2xl p-5',
);

export const widgetTitleClass =
  'text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]';

export interface PremiumCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
}

/**
 * Glass-HUD card — unified Aero-Planer surface.
 */
export function PremiumCard({ children, className, title, icon }: PremiumCardProps) {
  return (
    <div className={cn(premiumSurfaceClass, 'relative overflow-hidden h-full', className)}>
      {(title || icon) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <span className={widgetTitleClass}>{title}</span> : <span />}
          {icon ? (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-hover)] text-[var(--text-secondary)] ring-1 ring-[var(--glass-border)]">
              {icon}
            </span>
          ) : null}
        </div>
      )}
      {children}
    </div>
  );
}
