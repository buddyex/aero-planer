import { useId, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { PremiumCard } from './PremiumCard';

export interface TelemetryPoint {
  x: string | number;
  y: number;
}

export interface TelemetryWidgetProps {
  label: string;
  value: string | number;
  unit?: string;
  caption?: string;
  data?: TelemetryPoint[];
  accent?: 'emerald' | 'sky';
  icon?: ReactNode;
  className?: string;
}

const ACCENT = {
  emerald: { stroke: '#34d399' },
  sky: { stroke: '#2ec4b6' },
} as const;

/** Deterministic sparkline when no data is provided. */
export function buildSparkline(seed = 72, points = 12): TelemetryPoint[] {
  return Array.from({ length: points }, (_, i) => {
    const wave = Math.sin(i * 0.7 + seed * 0.01) * 12;
    const drift = (i / (points - 1)) * 18;
    return {
      x: i,
      y: Math.max(8, Math.min(100, seed - 20 + wave + drift + (i % 3) * 2)),
    };
  });
}

export function TelemetryWidget({
  label,
  value,
  unit = '',
  caption,
  data,
  accent = 'emerald',
  icon,
  className,
}: TelemetryWidgetProps) {
  const gradientId = useId().replace(/:/g, '');
  const colors = ACCENT[accent];
  const chartData = useMemo(
    () => data ?? buildSparkline(typeof value === 'number' ? value : 70),
    [data, value],
  );

  return (
    <PremiumCard title={label} icon={icon} className={cn(className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-3xl font-medium tracking-tight text-white">
            {value}
            {unit ? <span className="ml-0.5 text-2xl text-slate-400">{unit}</span> : null}
          </p>
          {caption ? (
            <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
              {caption}
            </p>
          ) : null}
        </div>

        <div className="h-16 w-[45%] min-w-[100px] max-w-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.stroke} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={colors.stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="y"
                stroke={colors.stroke}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive
                animationDuration={800}
                dot={false}
                activeDot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </PremiumCard>
  );
}
