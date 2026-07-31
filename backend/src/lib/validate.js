const GEO_BOUNDS = {
  latMin: -90,
  latMax: 90,
  lonMin: -180,
  lonMax: 180,
};

const SECTOR_RADIUS_MIN_KM = 5;
const SECTOR_RADIUS_MAX_KM = 60;

const OPERATOR_ROLES = ['Администратор', 'Руководитель', 'Техник', 'Оператор'];

const BATTERY_INSPECTION_RESULTS = ['Пройдена', 'Не пройдена'];

const PRECIPITATION_VALUES = ['Ясно', 'Дождь', 'Снег', 'Туман'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Фамилия Имя Отчество: кириллица, опциональный дефис в каждой части. */
const FULL_NAME_RE =
  /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)? [А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)? [А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/;

const FULL_NAME_ERROR = 'ФИО должно быть полностью: Фамилия Имя Отчество (кириллица).';

function normalizeFullName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function isValidFullName(value) {
  if (typeof value !== 'string') return false;
  return FULL_NAME_RE.test(normalizeFullName(value));
}

function requireFields(obj, fields) {
  const missing = [];
  for (const field of fields) {
    const value = obj?.[field];
    if (value === undefined || value === null || value === '') {
      missing.push(field);
      continue;
    }
    if (typeof value === 'string' && !value.trim()) {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Не заполнены обязательные поля: ${missing.join(', ')}.`,
      missing,
    };
  }
  return { ok: true };
}

function isPositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

function isNonNegativeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
}

function isValidCoord(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return { ok: false, error: 'Координаты должны быть числами.' };
  }
  if (latNum < GEO_BOUNDS.latMin || latNum > GEO_BOUNDS.latMax) {
    return {
      ok: false,
      error: `Широта должна быть в диапазоне ${GEO_BOUNDS.latMin}…${GEO_BOUNDS.latMax}°.`,
    };
  }
  if (lonNum < GEO_BOUNDS.lonMin || lonNum > GEO_BOUNDS.lonMax) {
    return {
      ok: false,
      error: `Долгота должна быть в диапазоне ${GEO_BOUNDS.lonMin}…${GEO_BOUNDS.lonMax}°.`,
    };
  }
  return { ok: true };
}

function isValidSectorRadius(radiusKm) {
  const radius = Number(radiusKm);
  if (!Number.isFinite(radius)) {
    return { ok: false, error: 'Укажите радиус сектора.' };
  }
  if (radius < SECTOR_RADIUS_MIN_KM || radius > SECTOR_RADIUS_MAX_KM) {
    return {
      ok: false,
      error: `Радиус сектора должен быть от ${SECTOR_RADIUS_MIN_KM} до ${SECTOR_RADIUS_MAX_KM} км.`,
    };
  }
  return { ok: true };
}

function isValidPin(pin) {
  const pinStr = String(pin ?? '').trim();
  if (!/^\d{6}$/.test(pinStr)) {
    return { ok: false, error: 'PIN-код должен содержать 6 цифр.' };
  }
  return { ok: true };
}

function isValidOperatorRole(role) {
  if (!OPERATOR_ROLES.includes(role)) {
    return { ok: false, error: 'Укажите допустимую роль оператора.' };
  }
  return { ok: true };
}

function isValidDateTime(value) {
  if (!value) {
    return { ok: false, error: 'Укажите дату и время.' };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Некорректная дата и время.' };
  }
  return { ok: true, date };
}

function isStartInPast(startTime) {
  const startCheck = isValidDateTime(startTime);
  if (!startCheck.ok) return startCheck;
  if (startCheck.date < new Date()) {
    return { ok: false, error: 'Время начала не может быть в прошлом.' };
  }
  return { ok: true };
}

function validateMissionPayload(payload, { checkPastStart = false } = {}) {
  const required = requireFields(payload, [
    'title',
    'start_time',
    'end_time',
    'operator_id',
    'drone_id',
    'sector_id',
    'battery_id',
  ]);
  if (!required.ok) return required;

  const startCheck = isValidDateTime(payload.start_time);
  if (!startCheck.ok) return startCheck;
  const endCheck = isValidDateTime(payload.end_time);
  if (!endCheck.ok) return endCheck;

  if (startCheck.date >= endCheck.date) {
    return { ok: false, error: 'Время окончания должно быть позже времени начала.' };
  }

  if (checkPastStart) {
    const pastCheck = isStartInPast(payload.start_time);
    if (!pastCheck.ok) return pastCheck;
  }

  return { ok: true };
}

function validateDronePayload(droneData) {
  if (!isNonEmptyString(droneData?.name)) {
    return { ok: false, error: 'Укажите название борта.' };
  }
  if (!isNonEmptyString(droneData?.serial_number)) {
    return { ok: false, error: 'Укажите серийный номер борта.' };
  }

  const numericFields = [
    { key: 'max_wind_speed', label: 'максимальная скорость ветра' },
    { key: 'battery_capacity', label: 'ёмкость АКБ' },
    { key: 'payload_capacity', label: 'грузоподъёмность' },
    { key: 'flight_time_max', label: 'максимальное время полёта' },
  ];

  for (const { key, label } of numericFields) {
    if (!isPositiveNumber(droneData[key])) {
      return { ok: false, error: `Поле «${label}» должно быть положительным числом.` };
    }
  }

  return { ok: true };
}

function validateSectorCreate(sectorName, centerLat, centerLon, radiusKm) {
  if (!isNonEmptyString(sectorName)) {
    return { ok: false, error: 'Укажите название сектора.' };
  }
  const coordCheck = isValidCoord(centerLat, centerLon);
  if (!coordCheck.ok) return coordCheck;
  const radiusCheck = isValidSectorRadius(radiusKm);
  if (!radiusCheck.ok) return radiusCheck;
  return { ok: true };
}

function validateSectorBoundary(payload) {
  const shapeType = payload?.shape_type ?? 'circle';

  if (shapeType === 'polygon') {
    const vertices = payload?.boundary_polygon;
    if (!Array.isArray(vertices) || vertices.length < 3) {
      return { ok: false, error: 'Полигон должен содержать минимум 3 вершины.' };
    }
    for (const vertex of vertices) {
      const coordCheck = isValidCoord(vertex?.lat ?? vertex?.[0], vertex?.lon ?? vertex?.[1]);
      if (!coordCheck.ok) return coordCheck;
    }
    return { ok: true };
  }

  const coordCheck = isValidCoord(payload?.center_lat, payload?.center_lon);
  if (!coordCheck.ok) return coordCheck;
  const radiusCheck = isValidSectorRadius(payload?.radius_km);
  if (!radiusCheck.ok) return radiusCheck;
  return { ok: true };
}

function validateOperatorCreate(payload) {
  if (!isValidFullName(payload?.full_name)) {
    return { ok: false, error: FULL_NAME_ERROR };
  }
  if (!isNonEmptyString(payload?.login)) {
    return { ok: false, error: 'Укажите логин оператора.' };
  }
  const roleCheck = isValidOperatorRole(payload?.role);
  if (!roleCheck.ok) return roleCheck;
  const pinCheck = isValidPin(payload?.pin);
  if (!pinCheck.ok) return pinCheck;
  return { ok: true };
}

function validateOperatorUpdate(payload) {
  if (!isValidFullName(payload?.full_name)) {
    return { ok: false, error: FULL_NAME_ERROR };
  }
  if (!isNonEmptyString(payload?.login)) {
    return { ok: false, error: 'Укажите логин оператора.' };
  }
  const roleCheck = isValidOperatorRole(payload?.role);
  if (!roleCheck.ok) return roleCheck;
  if (payload?.pin) {
    const pinCheck = isValidPin(payload.pin);
    if (!pinCheck.ok) return pinCheck;
  }
  return { ok: true };
}

function validateBatteryInspection(payload) {
  if (!payload?.result || !BATTERY_INSPECTION_RESULTS.includes(payload.result)) {
    return { ok: false, error: 'Укажите результат проверки АКБ.' };
  }
  const capacity = Number(payload?.capacity_percent);
  if (!Number.isFinite(capacity) || capacity < 0 || capacity > 100) {
    return { ok: false, error: 'Ёмкость должна быть числом от 0 до 100.' };
  }
  return { ok: true };
}

function validateManualWeather(sectorId, windSpeed, temperature, precipitation) {
  if (sectorId === undefined || sectorId === null || sectorId === '') {
    return { ok: false, error: 'Укажите сектор.' };
  }
  if (!isNonNegativeNumber(windSpeed)) {
    return { ok: false, error: 'Укажите скорость ветра (неотрицательное число).' };
  }
  if (!Number.isFinite(Number(temperature))) {
    return { ok: false, error: 'Укажите температуру.' };
  }
  if (!PRECIPITATION_VALUES.includes(precipitation)) {
    return { ok: false, error: 'Укажите осадки: Ясно, Дождь, Снег или Туман.' };
  }
  return { ok: true };
}

module.exports = {
  GEO_BOUNDS,
  SECTOR_RADIUS_MIN_KM,
  SECTOR_RADIUS_MAX_KM,
  FULL_NAME_ERROR,
  requireFields,
  isPositiveNumber,
  isNonNegativeNumber,
  isValidCoord,
  isValidSectorRadius,
  isValidPin,
  isValidOperatorRole,
  isValidDateTime,
  isStartInPast,
  isValidFullName,
  normalizeFullName,
  validateMissionPayload,
  validateDronePayload,
  validateSectorCreate,
  validateSectorBoundary,
  validateOperatorCreate,
  validateOperatorUpdate,
  validateBatteryInspection,
  validateManualWeather,
};
