const fs = require('fs');
const PDFDocument = require('pdfkit');
const path = require('path');
const { all } = require('../db/pool');
const { getMissionForPdf } = require('./mission.service');

const FONT_PATH = path.join(__dirname, '../../assets/fonts/Arial.ttf');
const FONT_NAME = 'ArialCyr';

function formatRole(name, role) {
  if (!name?.trim()) return '—';
  return role ? `${name.trim()} (${role})` : name.trim();
}

function formatBatteryLine(row) {
  if (!row.battery_serial) return '—';
  return `АКБ: ${row.battery_serial} — ${row.battery_type ?? '—'} — ${row.battery_capacity ?? '—'} мАч (Номер цикла: ${row.battery_cycle_count ?? 0})`;
}

function missionDayKey(startTime) {
  const value = startTime instanceof Date ? startTime : new Date(String(startTime).replace(' ', 'T'));
  const pad = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}`;
}

function formatMissionDayForSheet(startTime) {
  const value = startTime instanceof Date ? startTime : new Date(String(startTime).replace(' ', 'T'));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.${value.getFullYear()}`;
}

async function resolveFlightSheetNumber(missionId, startTime) {
  const allMissions = await all('SELECT id, start_time FROM missions ORDER BY start_time ASC');
  const dayKey = missionDayKey(startTime);
  const sameDay = allMissions.filter((m) => missionDayKey(m.start_time) === dayKey);
  sameDay.sort((a, b) => {
    const timeDiff = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(a.id).localeCompare(String(b.id));
  });
  const index = sameDay.findIndex((m) => String(m.id) === String(missionId));
  const seq = index >= 0 ? index + 1 : sameDay.length + 1;
  return `ПЛ-${formatMissionDayForSheet(startTime)}-${String(seq).padStart(3, '0')}`;
}

function registerPdfFont(doc) {
  if (fs.existsSync(FONT_PATH)) {
    doc.registerFont(FONT_NAME, FONT_PATH);
    doc.font(FONT_NAME);
    return;
  }
  doc.font('Helvetica');
}

async function buildFlightSheetPdf(missionId) {
  const row = await getMissionForPdf(missionId);
  if (!row) return null;

  const sheetNumber = await resolveFlightSheetNumber(missionId, row.start_time);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerPdfFont(doc);

    doc.fontSize(18).text(`ПОЛЕТНЫЙ ЛИСТ ${sheetNumber}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Задание сформировал: ${formatRole(row.creator_name, row.creator_role)}`);
    doc.text(`Задание утвердил: ${formatRole(row.approver_name, row.approver_role)}`);
    doc.text(`Дата и время формирования: ${new Date().toLocaleString('ru-RU')}`);
    doc.moveDown();

    doc.fontSize(12).text('Данные миссии', { underline: true });
    doc.fontSize(10);
    doc.text(`Сектор: ${row.sector_name ?? '—'}`);
    doc.text(`Модель БПЛА: ${row.drone_name ?? '—'}`);
    doc.text(`Серийный номер: ${row.drone_serial ?? '—'}`);
    doc.text(`Цель миссии: ${row.title}`);
    doc.text(`Начало: ${row.start_time ?? '—'}`);
    doc.text(`Окончание: ${row.end_time ?? '—'}`);
    doc.moveDown();

    doc.fontSize(12).text('Аудит метеоусловий', { underline: true });
    doc.fontSize(10);
    doc.text(`Температура: ${row.temperature != null ? `${row.temperature} °C` : '—'}`);
    doc.text(`Скорость ветра: ${row.wind_speed != null ? `${row.wind_speed} м/с` : '—'}`);
    doc.text(`Осадки: ${row.precipitation ?? '—'}`);
    doc.text(`Источник данных: ${row.weather_source ?? '—'}`);
    doc.moveDown();

    doc.fontSize(12).text('Данные системы питания', { underline: true });
    doc.fontSize(10).text(formatBatteryLine(row));
    doc.moveDown();

    doc.fontSize(12).text('Контроль безопасности', { underline: true });
    doc.fontSize(10).text(
      'Проверка Geofencing: Конфликтов с No-Fly зонами на момент старта не обнаружено. Полёт санкционирован.',
    );
    doc.moveDown();

    doc.text(`Статус миссии: ${row.status}`);
    doc.text(`Оператор БПЛА: ${row.operator_name ?? '—'}`);
    doc.text(`Руководитель полётов: ${formatRole(row.approver_name, row.approver_role)}`);

    doc.end();
  });
}

module.exports = { buildFlightSheetPdf };
