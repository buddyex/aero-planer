import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useApi } from '../../context/ApiContext';
import { useAuth } from '../../context/AuthContext';
import type { Battery, Mission } from '../../types';
import { formatBatteryOptionLabel } from '../../utils/batteries';
import {
  evaluateMissionWeatherRisk,
  logBlockedLaunchAttempt,
  type MissionWeatherRisk,
} from '../../utils/missionWeatherRisk';
import { Modal } from '../ui/Modal';
import { AppSelect } from '../ui/AppSelect';
import {
  createDefaultValue,
  RussianDateTimePicker,
  type RussianDateTimeValue,
} from '../ui/RussianDateTimePicker';
import { RiskAssessmentBlock } from './RiskAssessmentBlock';
import { MissionRouteMap } from './MissionRouteMap';
import './CreateMissionModal.css';

interface CreateMissionModalProps {
  open: boolean;
  onClose: () => void;
  mission?: Mission | null;
}

function valueFromIso(iso: string): RussianDateTimeValue {
  return { iso: iso.trim(), isUtc: false };
}

export function CreateMissionModal({ open, onClose, mission = null }: CreateMissionModalProps) {
  const { readyDrones, availablePilots, sectors, createMission, updateMission, refreshAppData, getDroneById, operators } =
    useAppData();
  const api = useApi();
  const { user } = useAuth();
  const isEditMode = Boolean(mission);

  const [title, setTitle] = useState('');
  const [operatorId, setOperatorId] = useState(availablePilots[0]?.id ?? 0);
  const [droneId, setDroneId] = useState(readyDrones[0]?.id ?? 0);
  const [batteryId, setBatteryId] = useState('');
  const [availableBatteries, setAvailableBatteries] = useState<Battery[]>([]);
  const [pendingInspectionCount, setPendingInspectionCount] = useState(0);
  const [sectorId, setSectorId] = useState(sectors[0]?.id ?? 0);
  const [flightRadiusM, setFlightRadiusM] = useState(500);
  const [flightAltitudeM, setFlightAltitudeM] = useState(120);
  const [start, setStart] = useState<RussianDateTimeValue>(() => createDefaultValue(1));
  const [end, setEnd] = useState<RussianDateTimeValue>(() => createDefaultValue(3));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [weatherRisk, setWeatherRisk] = useState<MissionWeatherRisk>({
    level: 'unknown',
    message: '',
    windBlocked: false,
  });
  const [routeGeometry, setRouteGeometry] = useState<string | null>(null);
  const [drawRouteEnabled, setDrawRouteEnabled] = useState(false);

  const selectableDrones = useMemo(() => {
    if (!isEditMode || !mission) return readyDrones;
    if (readyDrones.some((d) => d.id === mission.drone_id)) return readyDrones;
    return [
      ...readyDrones,
      {
        id: mission.drone_id,
        serial_number: mission.drone_serial ?? `#${mission.drone_id}`,
        name: mission.drone_name ?? 'Борт миссии',
        status: 'Запланирован' as const,
        flight_hours: 0,
      },
    ];
  }, [isEditMode, mission, readyDrones]);

  const pilotOptions = useMemo(() => {
    if (user?.role === 'Оператор' && user.id) {
      const self = operators.find((o) => o.id === user.id);
      if (self && !availablePilots.some((o) => o.id === user.id)) {
        return [self, ...availablePilots];
      }
    }
    return availablePilots;
  }, [availablePilots, operators, user]);

  const selectedDrone = getDroneById(droneId);
  const selectedSector = sectors.find((s) => s.id === sectorId);

  useEffect(() => {
    const risk = evaluateMissionWeatherRisk(
      selectedSector?.wind_speed,
      selectedDrone?.max_wind_speed,
      selectedSector?.precipitation,
    );
    setWeatherRisk(risk);
  }, [
    selectedDrone?.max_wind_speed,
    selectedSector?.wind_speed,
    selectedSector?.precipitation,
    droneId,
    sectorId,
  ]);

  useEffect(() => {
    if (!open) return;
    refreshAppData();

    if (mission) {
      setTitle(mission.title);
      setOperatorId(mission.operator_id);
      setDroneId(mission.drone_id);
      setBatteryId(mission.battery_id ?? '');
      setSectorId(mission.sector_id);
      setFlightRadiusM(mission.flight_radius_m ?? 500);
      setFlightAltitudeM(mission.flight_altitude_m ?? 120);
      setStart(valueFromIso(mission.start_time));
      setEnd(valueFromIso(mission.end_time));
      setRouteGeometry(mission.route_geometry ?? null);
    } else {
      setTitle('');
      setRouteGeometry(null);
      setDrawRouteEnabled(false);
      setStart(createDefaultValue(1));
      setEnd(createDefaultValue(3));
      setFlightRadiusM(500);
      setFlightAltitudeM(120);
      if (user?.role === 'Оператор') {
        setOperatorId(user.id);
      }
    }

    void (async () => {
      const result = await api.getAvailableBatteries();
      if (result.ok && result.data) {
        const batteries = result.data as Battery[];
        setAvailableBatteries(batteries);
        setPendingInspectionCount(result.pendingInspectionCount ?? 0);
        if (mission?.battery_id) {
          setBatteryId(mission.battery_id);
        } else {
          setBatteryId(batteries[0]?.id ?? '');
        }
      } else {
        setAvailableBatteries([]);
        setPendingInspectionCount(0);
        setBatteryId('');
      }
    })();
  }, [open, refreshAppData, api, mission]);

  useEffect(() => {
    if (availableBatteries.length === 0) {
      if (!isEditMode) setBatteryId('');
      return;
    }
    if (!availableBatteries.some((battery) => battery.id === batteryId)) {
      if (isEditMode && mission?.battery_id) {
        setBatteryId(mission.battery_id);
      } else {
        setBatteryId(availableBatteries[0].id);
      }
    }
  }, [availableBatteries, batteryId, isEditMode, mission?.battery_id]);

  useEffect(() => {
    if (selectableDrones.length === 0) {
      setDroneId(0);
      return;
    }
    if (!selectableDrones.some((d) => d.id === droneId)) {
      setDroneId(selectableDrones[0].id);
    }
  }, [selectableDrones, droneId]);

  useEffect(() => {
    if (pilotOptions.length === 0) {
      setOperatorId(0);
      return;
    }
    if (!pilotOptions.some((o) => o.id === operatorId)) {
      setOperatorId(pilotOptions[0].id);
    }
  }, [pilotOptions, operatorId]);

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
    setError('');

    if (sectors.length === 0 || sectorId <= 0) {
      setError('Создайте хотя бы один сектор перед планированием миссии.');
      return;
    }
    if (!start.iso || !end.iso) {
      setError('Укажите дату и время в формате ДД.ММ.ГГГГ ЧЧ:ММ');
      return;
    }

    if (weatherRisk.windBlocked) {
      setError(weatherRisk.message);
      await logBlockedLaunchAttempt(
        selectedDrone?.name ?? mission?.drone_name ?? 'БПЛА',
        user?.id,
      );
      return;
    }

    if (!batteryId) {
      setError('Выберите доступную АКБ.');
      return;
    }

    setSaving(true);
    const payload = {
      title: title.trim(),
      operator_id: operatorId,
      drone_id: droneId,
      battery_id: batteryId,
      sector_id: sectorId,
      start_time: start.iso,
      end_time: end.iso,
      flight_radius_m: flightRadiusM,
      flight_altitude_m: flightAltitudeM,
      route_geometry: routeGeometry,
    };
    const result = isEditMode && mission
      ? await updateMission(mission.id, payload)
      : await createMission(payload);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (!isEditMode) {
      setTitle('');
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditMode ? 'Редактировать миссию' : 'Создать миссию'}
    >
      <form onSubmit={handleSubmit} className="create-mission-form">
        <div className="form-field">
          <label className="form-field__label" htmlFor="mission-title">
            Название миссии
          </label>
          <input
            id="mission-title"
            className="form-field__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Патруль сектора Альфа"
            required
          />
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="mission-operator">
            Оператор (пилот)
          </label>
          <AppSelect
            id="mission-operator"
            value={operatorId}
            disabled={pilotOptions.length === 0 || user?.role === 'Оператор'}
            onChange={(v) => setOperatorId(Number(v))}
            options={
              pilotOptions.length === 0
                ? [{ value: 0, label: 'Нет доступных операторов', disabled: true }]
                : pilotOptions.map((o) => ({
                    value: o.id,
                    label: `${o.full_name} — ${o.role}`,
                  }))
            }
          />
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="mission-drone">
            Борт БПЛА
          </label>
          <AppSelect
            id="mission-drone"
            value={droneId}
            onChange={(v) => setDroneId(Number(v))}
            options={
              selectableDrones.length === 0
                ? [{ value: 0, label: 'Нет готовых бортов', disabled: true }]
                : selectableDrones.map((d) => ({
                    value: d.id,
                    label: `${d.serial_number} (${d.name}) — ${d.status}, налёт ${(d.flight_hours ?? 0).toFixed(1)} ч`,
                  }))
            }
          />
          <span className="form-field__hint">
            Только борта со статусом «Готов» и налётом ≤ 100 ч
          </span>
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="mission-battery">
            Аккумулятор (АКБ)
          </label>
          <AppSelect
            id="mission-battery"
            value={batteryId}
            disabled={availableBatteries.length === 0}
            onChange={(v) => setBatteryId(String(v))}
            options={
              availableBatteries.length === 0
                ? [{ value: '', label: 'Нет доступных АКБ', disabled: true }]
                : availableBatteries.map((battery) => ({
                    value: battery.id,
                    label: formatBatteryOptionLabel(battery),
                  }))
            }
          />
          <span className="form-field__hint">
            Только АКБ со статусом «Отлично», не назначенные на активные миссии
            {availableBatteries.length === 0 && pendingInspectionCount > 0 && (
              <> · {pendingInspectionCount} АКБ ожидают проверки техником</>
            )}
          </span>
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="mission-sector">
            Сектор
          </label>
          <AppSelect
            id="mission-sector"
            value={sectorId}
            disabled={sectors.length === 0}
            onChange={(v) => setSectorId(Number(v))}
            options={
              sectors.length === 0
                ? [{ value: 0, label: 'Нет доступных секторов', disabled: true }]
                : sectors.map((s) => ({
                    value: s.id,
                    label: `${s.sector_name} — риск: ${s.risk_level}`,
                  }))
            }
          />
          {sectors.length === 0 && (
            <span className="form-field__hint">Сначала создайте сектор на карте в разделе «Дашборд».</span>
          )}
        </div>

        <div className="create-mission-form__row">
          <div className="form-field">
            <label className="form-field__label" htmlFor="mission-radius">
              Радиус полёта, м
            </label>
            <input
              id="mission-radius"
              type="number"
              className="form-field__input"
              value={flightRadiusM}
              onChange={(e) => setFlightRadiusM(Number(e.target.value))}
              min={50}
              max={50000}
              step={50}
              required
            />
          </div>
          <div className="form-field">
            <label className="form-field__label" htmlFor="mission-altitude">
              Высота полёта, м
            </label>
            <input
              id="mission-altitude"
              type="number"
              className="form-field__input"
              value={flightAltitudeM}
              onChange={(e) => setFlightAltitudeM(Number(e.target.value))}
              min={0}
              max={500}
              step={10}
              required
            />
          </div>
        </div>

        <div className="create-mission-form__row">
          <RussianDateTimePicker
            id="mission-start"
            label="Начало"
            value={start}
            onChange={setStart}
          />
          <RussianDateTimePicker
            id="mission-end"
            label="Окончание"
            value={end}
            onChange={setEnd}
          />
        </div>

        <div className="form-field">
          <label className="form-field__label">
            <input
              type="checkbox"
              checked={drawRouteEnabled}
              onChange={(e) => setDrawRouteEnabled(e.target.checked)}
            />{' '}
            Нарисовать маршрут на карте (опционально)
          </label>
          <MissionRouteMap
            sector={sectors.find((s) => s.id === sectorId)}
            routeGeometry={routeGeometry}
            drawEnabled={drawRouteEnabled}
            onRouteChange={setRouteGeometry}
          />
        </div>

        <RiskAssessmentBlock risk={weatherRisk} />

        {error && <p className="form-field__error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={
              saving ||
              selectableDrones.length === 0 ||
              pilotOptions.length === 0 ||
              sectors.length === 0 ||
              availableBatteries.length === 0 ||
              !batteryId ||
              !title.trim() ||
              weatherRisk.windBlocked
            }
          >
            {saving ? 'Сохранение…' : isEditMode ? 'Сохранить изменения' : user?.role === 'Оператор' ? 'Подать на утверждение' : 'Запланировать миссию'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
