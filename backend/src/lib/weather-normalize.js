const KNOTS_TO_MS = 1.94384;

function knotsToMps(knots) {
  const value = Number(knots);
  if (!Number.isFinite(value)) {
    throw new Error('Не удалось конвертировать скорость ветра из узлов.');
  }
  return value / KNOTS_TO_MS;
}

/**
 * WMO weather code Open-Meteo → значения CHECK таблицы weather_logs.
 */
function mapWeatherCodeToPrecipitation(weatherCode, precipitationMm = 0) {
  const code = Number(weatherCode);

  if (code === 45 || code === 48) return 'Туман';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Снег';
  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    code === 95 ||
    code === 96 ||
    code === 99
  ) {
    return 'Дождь';
  }
  if (Number(precipitationMm) > 0.1) return 'Дождь';
  return 'Ясно';
}

function mapMetarConditions(wxString, flightCategory) {
  const wx = String(wxString || '').toUpperCase();
  if (wx.includes('FG') || wx.includes('BR') || wx.includes('MIFG')) return 'Туман';
  if (wx.includes('SN') || wx.includes('GS') || wx.includes('PL')) return 'Снег';
  if (wx.includes('RA') || wx.includes('DZ') || wx.includes('SH')) return 'Дождь';
  if (String(flightCategory || '').toUpperCase() === 'LIFR') return 'Туман';
  return 'Ясно';
}

function kmToRadiusMiles(radiusKm) {
  const km = Number(radiusKm) > 0 ? Number(radiusKm) : 20;
  return Math.max(1, Math.ceil(km / 1.609));
}

function buildNoaaBbox(lat, lon, delta = 0.25) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  const minLat = (latitude - delta).toFixed(4);
  const minLon = (longitude - delta).toFixed(4);
  const maxLat = (latitude + delta).toFixed(4);
  const maxLon = (longitude + delta).toFixed(4);
  return `${minLat},${minLon},${maxLat},${maxLon}`;
}

module.exports = {
  knotsToMps,
  mapWeatherCodeToPrecipitation,
  mapMetarConditions,
  kmToRadiusMiles,
  buildNoaaBbox,
  KNOTS_TO_MS,
};
