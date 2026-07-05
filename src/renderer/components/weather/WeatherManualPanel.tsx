import { useEffect, useState, type FormEvent } from 'react';
import { useAppData } from '../../context/AppDataContext';
import type { Precipitation } from '../../types';
import { PRECIPITATION_OPTIONS } from '../../types';
import { GlassCard } from '../ui/GlassCard';
import { AppSelect } from '../ui/AppSelect';
import './WeatherManualPanel.css';

export function WeatherManualPanel() {
  const { sectors, applyManualSectorCorrection } = useAppData();

  const [sectorId, setSectorId] = useState(sectors[0]?.id ?? 0);
  const [windSpeed, setWindSpeed] = useState('5.0');
  const [temperature, setTemperature] = useState('10');
  const [precipitation, setPrecipitation] = useState<Precipitation>('Ясно');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (sectors.length === 0) {
      setSectorId(0);
      return;
    }
    if (!sectors.some((sector) => sector.id === sectorId)) {
      setSectorId(sectors[0].id);
    }
  }, [sectors, sectorId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (sectors.length === 0 || sectorId <= 0) return;
    const wind = Number(windSpeed);
    const temp = Number(temperature);
    if (Number.isNaN(wind) || Number.isNaN(temp)) return;

    await applyManualSectorCorrection({
      sector_id: sectorId,
      wind_speed: wind,
      temperature: temp,
      precipitation,
    });
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2500);
  };

  return (
    <GlassCard className="weather-manual-panel">
      <h3 className="weather-manual-panel__title">Ручной ввод погоды</h3>

      <form onSubmit={handleSubmit} className="weather-manual-panel__form">
        <fieldset className="weather-manual-panel__fieldset">
          <div className="form-field">
            <label className="form-field__label" htmlFor="manual-sector">
              Сектор
            </label>
            <AppSelect
              id="manual-sector"
              value={sectorId}
              disabled={sectors.length === 0}
              onChange={(v) => setSectorId(Number(v))}
              options={
                sectors.length === 0
                  ? [{ value: 0, label: 'Нет доступных секторов', disabled: true }]
                  : sectors.map((s) => ({ value: s.id, label: s.sector_name }))
              }
            />
          </div>

          <div className="weather-manual-panel__row">
            <div className="form-field">
              <label className="form-field__label" htmlFor="manual-wind">
                Ветер (м/с)
              </label>
              <input
                id="manual-wind"
                type="number"
                step="0.1"
                min="0"
                className="form-field__input"
                value={windSpeed}
                onChange={(e) => setWindSpeed(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="manual-temp">
                Температура (°C)
              </label>
              <input
                id="manual-temp"
                type="number"
                step="0.1"
                className="form-field__input"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="manual-precip">
              Осадки
            </label>
            <AppSelect
              id="manual-precip"
              value={precipitation}
              onChange={(v) => setPrecipitation(v as Precipitation)}
              options={PRECIPITATION_OPTIONS.map((p) => ({ value: p, label: p }))}
            />
          </div>

          {success && (
            <p className="weather-manual-panel__success" role="status">
              Корректировка применена — риск сектора пересчитан
            </p>
          )}

          <button
            type="submit"
            className="btn btn--primary weather-manual-panel__submit"
            disabled={sectors.length === 0}
          >
            Применить корректировку
          </button>
        </fieldset>
      </form>
    </GlassCard>
  );
}
