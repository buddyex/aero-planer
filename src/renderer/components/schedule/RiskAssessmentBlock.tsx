import type { MissionWeatherRisk } from '../../utils/missionWeatherRisk';
import './RiskAssessmentBlock.css';

interface RiskAssessmentBlockProps {
  risk: MissionWeatherRisk;
}

export function RiskAssessmentBlock({ risk }: RiskAssessmentBlockProps) {
  if (risk.level === 'unknown') {
    return null;
  }

  return (
    <div
      className={`risk-assessment risk-assessment--${risk.level}`}
      role="status"
      aria-live="polite"
    >
      <p className="risk-assessment__title">Оценка рисков</p>
      <p className="risk-assessment__message">{risk.message}</p>
    </div>
  );
}
