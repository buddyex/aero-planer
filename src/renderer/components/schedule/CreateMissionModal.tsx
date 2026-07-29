import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useApi } from '../../context/ApiContext';
import { useAuth } from '../../context/AuthContext';
import type { Battery, Mission, Operator } from '../../types';
import { formatBatteryOptionLabel, getBatteryStatusSuffix, isBatterySelectableForMission } from '../../utils/batteries';
import { isDroneBlockedByFlightHours } from '../../utils/maintenanceRules';
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
  const { drones, availablePilots, sectors, createMission, updateMission, refreshAppData, getDroneById, operators } =
    useAppData();
  const api = useApi();
  const { user } = useAuth();
  const isEditMode = Boolean(mission);

  const [title, setTitle] = useState('');
  const [operatorId, setOperatorId] = useState(availablePilots[0]?.id ?? 0);
  const [droneId, setDroneId] = useState(drones[0]?.id ?? 0);
  const [batteryId, setBatteryId] = useState('');
  const [availableBatteries, setAvailableBatteries] = useState<Battery[]>([]);
  const [pendingInspectionCount, setPendingInspectionCount] = useState(0);
  const [sectorId, setSectorId] = useState(sectors[0]?.id ?? 0);
  const [flightRadiusM, setFlightRadiusM] = useState(500);
  const [flightAltitudeM, setFlightAltitudeM] = useState(120);
  const [start, setStart] = useState<RussianDateTimeValue>(() => createDefaultValue(1));
  const [end, setEnd] = useState<RussianDateTimeValue>(() => createDefaultValue(3));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [weatherRisk, setWeatherRisk] = useState<MissionWeatherRisk>({
    level: 'unknown',
    message: '',
    windBlocked: false,
  });
  const [routeGeometry, setRouteGeometry] = useState<string | null>(null);

  const selectableDrones = useMemo(() => {
    if (!isEditMode || !mission) return drones;
    if (drones.some((d) => d.id === mission.drone_id)) return drones;
    return [
      ...drones,
      {
        id: mission.drone_id,
        serial_number: mission.drone_serial ?? `#${mission.drone_id}`,
        name: mission.drone_name ?? 'Борт миссии',
        status: 'Запланирован' as const,
        flight_hours: 0,
        max_wind_speed: 0,
        battery_capacity: 0,
        payload_capacity: 0,
        flight_time_max: 0,
      },
    ];
  }, [isEditMode, mission, drones]);

  const isDroneSelectable = (drone: (typeof selectableDrones)[number]) =>
    drone.status === 'Готов' && !isDroneBlockedByFlightHours(drone.flight_hours);

  const getDroneStatusSuffix = (drone: (typeof selectableDrones)[number]) => {
    if (['На ТО', 'Ремонт'].includes(drone.status)) return ` (${drone.status})`;
    if (isDroneBlockedByFlightHours(drone.flight_hours)) return ' (Превышен налёт)';
    if (drone.status !== 'Готов') return ` (${drone.status})`;
    return null;
  };

  const droneOptions = useMemo(
    () =>
      selectableDrones.length === 0
        ? [{ value: 0, label: 'Нет бортов в реестре', disabled: true }]
        : selectableDrones.map((d) => {
            const suffix = getDroneStatusSuffix(d);
            const selectable = isDroneSelectable(d);
            return {
              value: d.id,
              label: `${d.serial_number} (${d.name}) — ${d.status}, налёт ${(d.flight_hours ?? 0).toFixed(1)} ч${suffix ?? ''}`,
              disabled: !selectable,
              variant: !selectable ? ('blocked' as const) : ('default' as const),
            };
          }),
    [selectableDrones],
  );

  const batteryOptions = useMemo(
    () =>
      availableBatteries.length === 0
        ? [{ value: '', label: 'Нет АКБ в реестре', disabled: true }]
        : availableBatteries.map((battery) => {
            const suffix = getBatteryStatusSuffix(battery);
            const selectable = isBatterySelectableForMission(battery);
            return {
              value: battery.id,
              label: `${formatBatteryOptionLabel(battery)}${suffix ?? ''}`,
              disabled: !selectable,
              variant: !selectable ? ('blocked' as const) : ('default' as const),
            };
          }),
    [availableBatteries],
  );

  const selectedDroneSelectable = useMemo(
    () => selectableDrones.some((d) => d.id === droneId && isDroneSelectable(d)),
    [selectableDrones, droneId],
  );

  const selectedBatterySelectable = useMemo(
    () => availableBatteries.some((b) => b.id === batteryId && isBatterySelectableForMission(b)),
    [availableBatteries, batteryId],
  );

  const pilotOptions = useMemo(() => {
    if (user?.role === 'Оператор' && user.id) {
      const selfFromList = operators.find((o) => o.id === user.id);
      const self: Operator =
        selfFromList ??
        ({
          id: user.id,
          full_name: user.full_name,
          login: user.login,
          role: 'Оператор',
          duty_status: 'Свободен',
        } as Operator);
      return [self];
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
          const firstSelectable = batteries.find((b) => isBatterySelectableForMission(b));
          setBatteryId(firstSelectable?.id ?? batteries[0]?.id ?? '');
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
        const firstSelectable = availableBatteries.find((b) => isBatterySelectableForMission(b));
        setBatteryId(firstSelectable?.id ?? availableBatteries[0]?.id ?? '');
      }
    }
  }, [availableBatteries, batteryId, isEditMode, mission?.battery_id]);

  useEffect(() => {
    if (selectableDrones.length === 0) {
      setDroneId(0);
      return;
    }
    if (!selectableDrones.some((d) => d.id === droneId)) {
      const firstSelectable = selectableDrones.find((d) => isDroneSelectable(d));
      setDroneId(firstSelectable?.id ?? selectableDrones[0]?.id ?? 0);
    } else if (!isEditMode && !selectableDrones.some((d) => d.id === droneId && isDroneSelectable(d))) {
      const firstSelectable = selectableDrones.find((d) => isDroneSelectable(d));
      if (firstSelectable) setDroneId(firstSelectable.id);
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

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateMissionForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = 'Укажите название миссии.';
    }
    if (sectors.length === 0 || sectorId <= 0) {
      errors.sectorId = 'Выберите сектор.';
    }
    if (!batteryId) {
      errors.batteryId = 'Выберите доступную АКБ.';
    }
    if (!start.iso) {
      errors.start = 'Укажите дату и время начала.';
    }
    if (!end.iso) {
      errors.end = 'Укажите дату и время окончания.';
    }
    if (start.iso && end.iso) {
      const startDate = new Date(start.iso.replace(' ', 'T'));
      const endDate = new Date(end.iso.replace(' ', 'T'));
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate <= startDate) {
        errors.end = 'Время окончания должно быть позже времени начала.';
      }
      if (!isEditMode && !Number.isNaN(startDate.getTime()) && startDate < new Date()) {
        errors.start = 'Время начала не может быть в прошлом.';
      }
    }

    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const validationErrors = validateMissionForm();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
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
        <div className={`form-field${fieldErrors.title ? ' form-field--invalid' : ''}`}>
          <label className="form-field__label" htmlFor="mission-title">
            Название миссии
          </label>
          <input
            id="mission-title"
            className="form-field__input"
            value={title}
            onChange={(e) => {
              clearFieldError('title');
              setTitle(e.target.value);
            }}
            placeholder="Например: Патруль сектора Альфа"
            required
          />
          {fieldErrors.title && <p className="form-field__error">{fieldErrors.title}</p>}
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
            options={droneOptions}
          />
          <span className="form-field__hint">
            Доступны только борта со статусом «Готов» и налётом &lt; 100 ч. Недоступные отмечены красным.
          </span>
        </div>

        <div className={`form-field${fieldErrors.batteryId ? ' form-field--invalid' : ''}`}>
          <label className="form-field__label" htmlFor="mission-battery">
            Аккумулятор (АКБ)
          </label>
          <AppSelect
            id="mission-battery"
            value={batteryId}
            disabled={availableBatteries.length === 0}
            onChange={(v) => {
              clearFieldError('batteryId');
              setBatteryId(String(v));
            }}
            options={batteryOptions}
          />
          <span className="form-field__hint">
            Доступны только АКБ со статусом «Отлично», не назначенные на активные миссии
            {availableBatteries.length > 0 &&
              !availableBatteries.some((b) => isBatterySelectableForMission(b)) &&
              pendingInspectionCount > 0 && (
              <> · {pendingInspectionCount} АКБ ожидают проверки техником</>
            )}
          </span>
          {fieldErrors.batteryId && <p className="form-field__error">{fieldErrors.batteryId}</p>}
        </div>

        <div className={`form-field${fieldErrors.sectorId ? ' form-field--invalid' : ''}`}>
          <label className="form-field__label" htmlFor="mission-sector">
            Сектор
          </label>
          <AppSelect
            id="mission-sector"
            value={sectorId}
            disabled={sectors.length === 0}
            onChange={(v) => {
              clearFieldError('sectorId');
              setSectorId(Number(v));
            }}
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
          {fieldErrors.sectorId && <p className="form-field__error">{fieldErrors.sectorId}</p>}
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
              max={5000}
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
            onChange={(value) => {
              clearFieldError('start');
              setStart(value);
            }}
            error={fieldErrors.start}
          />
          <RussianDateTimePicker
            id="mission-end"
            label="Окончание"
            value={end}
            onChange={(value) => {
              clearFieldError('end');
              setEnd(value);
            }}
            error={fieldErrors.end}
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
              !selectedDroneSelectable ||
              !selectedBatterySelectable ||
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
