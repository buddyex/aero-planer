import { useEffect, useRef } from 'react';
import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
import { useTheme } from '../../context/ThemeContext';
import { useAppData } from '../../context/AppDataContext';
import { GlassCard } from '../ui/GlassCard';
import './WeatherRiskChart.css';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

export function WeatherRiskChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const { isDark } = useTheme();
  const { sectors, getSectorRiskDistribution } = useAppData();
  const distribution = getSectorRiskDistribution();
  const total = sectors.length;

  useEffect(() => {
    if (total === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const textColor = isDark ? '#94a3b8' : '#64748b';
    const borderColor = isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.9)';

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Низкий', 'Средний', 'Высокий'],
        datasets: [
          {
            data: [distribution.Низкий, distribution.Средний, distribution.Высокий],
            backgroundColor: [
              'rgba(34, 197, 94, 0.85)',
              'rgba(234, 179, 8, 0.85)',
              'rgba(239, 68, 68, 0.85)',
            ],
            borderColor,
            borderWidth: 2,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              padding: 16,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { family: 'Inter', size: 12 },
            },
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f1f5f9' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#475569',
            borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(59, 130, 246, 0.3)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (ctx) => {
                const value = ctx.parsed;
                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                return ` ${ctx.label}: ${value} сек. (${pct}%)`;
              },
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [distribution, isDark, total]);

  return (
    <GlassCard accent className="weather-risk-chart">
      <div className="weather-risk-chart__header">
        <h2 className="section-title">Метеорологическая обстановка</h2>
      </div>
      <p className="section-subtitle">
        Распределение секторов по уровню погодного риска
      </p>
      {total === 0 ? (
        <p className="weather-risk-chart__empty">Нет секторов для отображения статистики риска.</p>
      ) : (
        <div className="weather-risk-chart__body">
          <div className="weather-risk-chart__canvas-wrap">
            <canvas ref={canvasRef} />
            <div className="weather-risk-chart__center">
              <span className="weather-risk-chart__total">{total}</span>
              <span className="weather-risk-chart__total-label">секторов</span>
            </div>
          </div>
          <div className="weather-risk-chart__legend-grid">
            {(['Низкий', 'Средний', 'Высокий'] as const).map((level) => {
              const count = distribution[level];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={level} className={`risk-stat risk-stat--${level === 'Низкий' ? 'low' : level === 'Средний' ? 'medium' : 'high'}`}>
                  <span className="risk-stat__value">{pct}%</span>
                  <span className="risk-stat__label">{level}</span>
                  <span className="risk-stat__count">{count} сек.</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
