const fs = require('fs');
const PDFDocument = require('pdfkit');
const path = require('path');
const { all } = require('../db/pool');
const { getMissionForPdf } = require('./mission.service');

const FONT_REGULAR = path.join(__dirname, '../../assets/fonts/Roboto-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '../../assets/fonts/Roboto-Bold.ttf');
const FONT_ARIAL = path.join(__dirname, '../../assets/fonts/Arial.ttf');

const MARGIN = 50;
const CONTENT_WIDTH = 595.28 - MARGIN * 2;

function formatRole(name, role) {
  if (!name?.trim()) return '—';
  return role ? `${name.trim()} (${role})` : name.trim();
}

function formatValue(value, suffix = '') {
  if (value == null || value === '') return '—';
  return `${value}${suffix}`;
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

function registerPdfFonts(doc) {
  if (fs.existsSync(FONT_REGULAR)) {
    doc.registerFont('Roboto', FONT_REGULAR);
    if (fs.existsSync(FONT_BOLD)) {
      doc.registerFont('Roboto-Bold', FONT_BOLD);
    }
    return { regular: 'Roboto', bold: fs.existsSync(FONT_BOLD) ? 'Roboto-Bold' : 'Roboto' };
  }
  if (fs.existsSync(FONT_ARIAL)) {
    doc.registerFont('ArialCyr', FONT_ARIAL);
    return { regular: 'ArialCyr', bold: 'ArialCyr' };
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}

function drawSection(doc, fonts, title, lines) {
  const startY = doc.y;
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor('#1a1a1a')
    .text(title, MARGIN, startY, { width: CONTENT_WIDTH });

  let y = doc.y + 4;
  doc.font(fonts.regular).fontSize(10).fillColor('#333333');

  for (const line of lines) {
    doc.text(line, MARGIN + 8, y, { width: CONTENT_WIDTH - 16 });
    y = doc.y + 2;
  }

  const boxHeight = y - startY + 8;
  doc
    .rect(MARGIN, startY - 4, CONTENT_WIDTH, boxHeight)
    .lineWidth(0.5)
    .strokeColor('#cccccc')
    .stroke();

  doc.y = startY + boxHeight + 10;
}

function drawSignatureBlock(doc, fonts) {
  doc.moveDown(1);
  doc.font(fonts.regular).fontSize(10).fillColor('#333333');
  const lineY = doc.y + 18;
  doc.text('Подпись оператора', MARGIN, lineY - 14);
  doc
    .moveTo(MARGIN + 120, lineY)
    .lineTo(MARGIN + 280, lineY)
    .strokeColor('#666666')
    .stroke();

  doc.text('Подпись диспетчера', MARGIN + 300, lineY - 14);
  doc
    .moveTo(MARGIN + 430, lineY)
    .lineTo(MARGIN + CONTENT_WIDTH, lineY)
    .strokeColor('#666666')
    .stroke();

  doc.y = lineY + 20;
}

async function buildFlightSheetPdf(missionId) {
  const row = await getMissionForPdf(missionId);
  if (!row) return null;

  const sheetNumber = await resolveFlightSheetNumber(missionId, row.start_time);
  const generatedAt = new Date().toLocaleString('ru-RU');
  const droneModel = row.drone_model_name ?? row.drone_name ?? '—';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fonts = registerPdfFonts(doc);
    doc.font(fonts.regular);

    doc
      .font(fonts.bold)
      .fontSize(18)
      .fillColor('#0d2137')
      .text(`ПОЛЕТНЫЙ ЛИСТ ${sheetNumber}`, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor('#666666')
      .text(`ID миссии: ${row.id}`, { align: 'center' });
    doc.moveDown(1);

    drawSection(doc, fonts, 'Шапка', [
      `Дата формирования: ${generatedAt}`,
      `Статус: ${row.status ?? '—'}`,
      `Сектор: ${row.sector_name ?? '—'}`,
      `Цель миссии: ${row.title ?? '—'}`,
      `Начало: ${row.start_time ?? '—'}    Окончание: ${row.end_time ?? '—'}`,
    ]);

    drawSection(doc, fonts, 'Персонал', [
      `Создал: ${formatRole(row.creator_name, row.creator_role)}`,
      `Назначен: ${formatRole(row.operator_name, row.operator_role)}`,
      `Утвердил: ${formatRole(row.approver_name, row.approver_role)}`,
    ]);

    drawSection(doc, fonts, 'Оборудование', [
      `Дрон — модель: ${droneModel}`,
      `Дрон — серийный номер: ${formatValue(row.drone_serial)}`,
      `Дрон — макс. ветер: ${formatValue(row.drone_max_wind, ' м/с')}`,
      `АКБ — тип: ${formatValue(row.battery_type)}`,
      `АКБ — серийный номер: ${formatValue(row.battery_serial)}`,
      `АКБ — ёмкость: ${formatValue(row.battery_capacity, ' мАч')}`,
      `АКБ — циклы: ${formatValue(row.battery_cycle_count)}`,
    ]);

    drawSection(doc, fonts, 'Метеоусловия', [
      `Температура: ${formatValue(row.temperature, ' °C')}`,
      `Ветер: ${formatValue(row.wind_speed, ' м/с')}`,
      `Осадки: ${formatValue(row.precipitation)}`,
      `Источник данных: ${formatValue(row.weather_source)}`,
    ]);

    drawSignatureBlock(doc, fonts);

    doc.end();
  });
}

module.exports = { buildFlightSheetPdf };
