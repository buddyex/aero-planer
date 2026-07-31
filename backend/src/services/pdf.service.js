const fs = require('fs');
const PDFDocument = require('pdfkit');
const path = require('path');
const { all } = require('../db/pool');
const { getMissionForPdf } = require('./mission.service');

const FONT_REGULAR = path.join(__dirname, '../../assets/fonts/Roboto-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '../../assets/fonts/Roboto-Bold.ttf');
const FONT_ARIAL = path.join(__dirname, '../../assets/fonts/Arial.ttf');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_H = 26;
const SECTION_GAP = 10;
const SIGNATURE_H = 78;
const FOOTER_H = 32;

const COLORS = {
  navy: '#0d2137',
  accent: '#0f8f84',
  accentSoft: '#e6f5f3',
  sectionBg: '#f7faf9',
  border: '#d5e0de',
  label: '#6b7c86',
  value: '#1a2b36',
  muted: '#8a9aa3',
  white: '#ffffff',
  line: '#c5d2d0',
};

function formatRole(name, role) {
  if (!name?.trim()) return '—';
  return role ? `${name.trim()} (${role})` : name.trim();
}

function formatValue(value, suffix = '') {
  if (value == null || value === '') return '—';
  return `${value}${suffix}`;
}

function formatDateTime(value) {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

/** Текст без автопереноса страниц PDFKit. */
function drawText(doc, text, x, y, options = {}) {
  doc.text(String(text), x, y, {
    lineBreak: false,
    ...options,
  });
}

function contentBottomLimit() {
  return PAGE_HEIGHT - FOOTER_H;
}

function drawHeader(doc, fonts, sheetNumber, generatedAt) {
  const headerHeight = 64;

  doc.rect(0, 0, PAGE_WIDTH, headerHeight).fill(COLORS.navy);
  doc.rect(0, headerHeight, PAGE_WIDTH, 3).fill(COLORS.accent);

  doc.roundedRect(MARGIN, 14, 32, 32, 7).fill(COLORS.accent);
  doc.font(fonts.bold).fontSize(12).fillColor(COLORS.white);
  drawText(doc, 'AP', MARGIN, 23, { width: 32, align: 'center' });

  doc.font(fonts.bold).fontSize(15).fillColor(COLORS.white);
  drawText(doc, 'Aero-Planer', MARGIN + 44, 16);

  doc.font(fonts.regular).fontSize(8).fillColor('#a8c0c8');
  drawText(doc, 'АРМ диспетчера БПЛА · полётный лист', MARGIN + 44, 36);

  doc.font(fonts.bold).fontSize(10).fillColor(COLORS.accent);
  drawText(doc, sheetNumber, MARGIN, 18, { width: CONTENT_WIDTH, align: 'right' });

  doc.font(fonts.regular).fontSize(8).fillColor('#a8c0c8');
  drawText(doc, `Сформирован: ${generatedAt}`, MARGIN, 36, {
    width: CONTENT_WIDTH,
    align: 'right',
  });

  return headerHeight + 16;
}

function drawDocumentTitle(doc, fonts, y, status) {
  doc.font(fonts.bold).fontSize(16).fillColor(COLORS.navy);
  drawText(doc, 'ПОЛЁТНЫЙ ЛИСТ', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });

  let nextY = y + 22;

  if (status) {
    const badgeText = String(status);
    doc.font(fonts.bold).fontSize(9);
    const badgeWidth = Math.min(160, doc.widthOfString(badgeText) + 22);
    const badgeX = MARGIN + (CONTENT_WIDTH - badgeWidth) / 2;

    doc.roundedRect(badgeX, nextY, badgeWidth, 20, 10).fill(COLORS.accentSoft);
    doc.fillColor(COLORS.accent);
    drawText(doc, badgeText, badgeX, nextY + 4, { width: badgeWidth, align: 'center' });
    nextY += 28;
  }

  return nextY + 4;
}

function drawFieldColumn(doc, fonts, fields, x, y, colWidth) {
  let cursorY = y;

  for (const field of fields) {
    doc.font(fonts.regular).fontSize(7).fillColor(COLORS.label);
    drawText(doc, field.label.toUpperCase(), x, cursorY, { width: colWidth - 8 });

    doc.font(fonts.bold).fontSize(10).fillColor(COLORS.value);
    drawText(doc, field.value, x, cursorY + 10, { width: colWidth - 8 });

    cursorY += ROW_H;
  }

  return cursorY;
}

function sectionBoxHeight(rowCount, extra = 0) {
  const titleBlock = 24;
  const padBottom = 10;
  return titleBlock + extra + rowCount * ROW_H + padBottom;
}

function drawSectionCard(doc, fonts, startY, boxHeight, title) {
  doc.roundedRect(MARGIN, startY, CONTENT_WIDTH, boxHeight, 7).fill(COLORS.sectionBg);
  doc
    .roundedRect(MARGIN, startY, CONTENT_WIDTH, boxHeight, 7)
    .lineWidth(0.8)
    .strokeColor(COLORS.border)
    .stroke();
  doc.rect(MARGIN, startY, 3.5, boxHeight).fill(COLORS.accent);

  const pad = 12;
  doc.font(fonts.bold).fontSize(10).fillColor(COLORS.navy);
  drawText(doc, title, MARGIN + pad, startY + 8, { width: CONTENT_WIDTH - pad * 2 });

  doc
    .moveTo(MARGIN + pad, startY + 22)
    .lineTo(MARGIN + CONTENT_WIDTH - pad, startY + 22)
    .lineWidth(0.6)
    .strokeColor(COLORS.border)
    .stroke();

  return startY + 26;
}

function drawSection(doc, fonts, startY, title, leftFields, rightFields = []) {
  const pad = 12;
  const gap = 16;
  const colWidth = (CONTENT_WIDTH - pad * 2 - gap) / 2;
  const rows = Math.max(leftFields.length, rightFields.length, 1);
  const boxHeight = sectionBoxHeight(rows);
  const fieldsTop = drawSectionCard(doc, fonts, startY, boxHeight, title);

  drawFieldColumn(doc, fonts, leftFields, MARGIN + pad, fieldsTop, colWidth);
  if (rightFields.length) {
    drawFieldColumn(doc, fonts, rightFields, MARGIN + pad + colWidth + gap, fieldsTop, colWidth);
  }

  return startY + boxHeight + SECTION_GAP;
}

function drawEquipmentSection(doc, fonts, startY, droneFields, batteryFields) {
  const pad = 12;
  const gap = 14;
  const colWidth = (CONTENT_WIDTH - pad * 2 - gap) / 2;
  const rows = Math.max(droneFields.length, batteryFields.length, 1);
  const subTitleH = 16;
  const boxHeight = sectionBoxHeight(rows, subTitleH);
  const afterTitle = drawSectionCard(doc, fonts, startY, boxHeight, 'Оборудование');

  doc.font(fonts.bold).fontSize(8).fillColor(COLORS.accent);
  drawText(doc, 'Дрон', MARGIN + pad, afterTitle);
  drawText(doc, 'АКБ', MARGIN + pad + colWidth + gap, afterTitle);

  const fieldsTop = afterTitle + subTitleH;
  drawFieldColumn(doc, fonts, droneFields, MARGIN + pad, fieldsTop, colWidth);
  drawFieldColumn(doc, fonts, batteryFields, MARGIN + pad + colWidth + gap, fieldsTop, colWidth);

  return startY + boxHeight + SECTION_GAP;
}

function drawSignatureBlock(doc, fonts, startY) {
  const boxHeight = SIGNATURE_H;
  const half = (CONTENT_WIDTH - 14) / 2;

  // Если не влезает целиком — переносим весь блок на следующую страницу
  let y = startY;
  if (y + boxHeight > contentBottomLimit()) {
    doc.addPage();
    y = MARGIN;
  } else {
    // Прижимаем к низу страницы, только когда места достаточно
    const pinnedY = contentBottomLimit() - boxHeight;
    if (y < pinnedY) y = pinnedY;
  }

  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, boxHeight, 7).fill(COLORS.white);
  doc
    .roundedRect(MARGIN, y, CONTENT_WIDTH, boxHeight, 7)
    .lineWidth(0.8)
    .strokeColor(COLORS.border)
    .stroke();

  const blocks = [
    { title: 'Подпись оператора', x: MARGIN + 14 },
    { title: 'Подпись диспетчера', x: MARGIN + 14 + half + 14 },
  ];

  for (const block of blocks) {
    doc.font(fonts.bold).fontSize(9).fillColor(COLORS.navy);
    drawText(doc, block.title, block.x, y + 12, { width: half - 14 });

    doc.font(fonts.regular).fontSize(8).fillColor(COLORS.muted);
    drawText(doc, 'Ф.И.О. / подпись', block.x, y + 28, { width: half - 14 });

    const lineY = y + 54;
    doc
      .moveTo(block.x, lineY)
      .lineTo(block.x + half - 28, lineY)
      .lineWidth(1)
      .strokeColor(COLORS.line)
      .stroke();

    doc.font(fonts.regular).fontSize(7).fillColor(COLORS.muted);
    drawText(doc, 'дата', block.x, lineY + 5, { width: half - 28 });
  }

  return y + boxHeight;
}

function drawFooter(doc, fonts, pageNo) {
  const footerY = PAGE_HEIGHT - 22;

  doc
    .moveTo(MARGIN, footerY - 8)
    .lineTo(MARGIN + CONTENT_WIDTH, footerY - 8)
    .lineWidth(0.5)
    .strokeColor(COLORS.border)
    .stroke();

  doc.font(fonts.regular).fontSize(7).fillColor(COLORS.muted);
  drawText(doc, 'Aero-Planer · документ сформирован автоматически', MARGIN, footerY, {
    width: CONTENT_WIDTH / 2,
    align: 'left',
  });
  drawText(doc, `стр. ${pageNo}`, MARGIN + CONTENT_WIDTH / 2, footerY, {
    width: CONTENT_WIDTH / 2,
    align: 'right',
  });
}

async function buildFlightSheetPdf(missionId) {
  const row = await getMissionForPdf(missionId);
  if (!row) return null;

  const sheetNumber = await resolveFlightSheetNumber(missionId, row.start_time);
  const generatedAt = new Date().toLocaleString('ru-RU');
  const droneModel = row.drone_model_name ?? row.drone_name ?? '—';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      // Нулевой margin: позиции считаем сами, иначе PDFKit рвёт текст по страницам
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Полётный лист ${sheetNumber}`,
        Author: 'Aero-Planer',
        Subject: 'Полётный лист миссии БПЛА',
      },
    });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fonts = registerPdfFonts(doc);
    doc.font(fonts.regular);

    let y = drawHeader(doc, fonts, sheetNumber, generatedAt);
    y = drawDocumentTitle(doc, fonts, y, row.status);

    y = drawSection(
      doc,
      fonts,
      y,
      'Общие сведения',
      [
        { label: 'Сектор', value: formatValue(row.sector_name) },
        { label: 'Цель миссии', value: formatValue(row.title) },
        { label: 'Начало', value: formatDateTime(row.start_time) },
      ],
      [
        { label: 'Статус', value: formatValue(row.status) },
        { label: 'Дата формирования', value: generatedAt },
        { label: 'Окончание', value: formatDateTime(row.end_time) },
      ],
    );

    y = drawSection(
      doc,
      fonts,
      y,
      'Персонал',
      [
        { label: 'Создал', value: formatRole(row.creator_name, row.creator_role) },
        { label: 'Утвердил', value: formatRole(row.approver_name, row.approver_role) },
      ],
      [{ label: 'Назначен', value: formatRole(row.operator_name, row.operator_role) }],
    );

    y = drawEquipmentSection(
      doc,
      fonts,
      y,
      [
        { label: 'Модель', value: droneModel },
        { label: 'Серийный номер', value: formatValue(row.drone_serial) },
        { label: 'Макс. ветер', value: formatValue(row.drone_max_wind, ' м/с') },
      ],
      [
        { label: 'Тип', value: formatValue(row.battery_type) },
        { label: 'Серийный номер', value: formatValue(row.battery_serial) },
        { label: 'Ёмкость', value: formatValue(row.battery_capacity, ' мАч') },
        { label: 'Циклы', value: formatValue(row.battery_cycle_count) },
      ],
    );

    y = drawSection(
      doc,
      fonts,
      y,
      'Метеоусловия',
      [
        { label: 'Температура', value: formatValue(row.temperature, ' °C') },
        { label: 'Осадки', value: formatValue(row.precipitation) },
      ],
      [
        { label: 'Ветер', value: formatValue(row.wind_speed, ' м/с') },
        { label: 'Источник данных', value: formatValue(row.weather_source) },
      ],
    );

    drawSignatureBlock(doc, fonts, y + 4);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      drawFooter(doc, fonts, i - range.start + 1);
    }

    doc.end();
  });
}

module.exports = { buildFlightSheetPdf };
