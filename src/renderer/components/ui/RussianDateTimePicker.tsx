import { useEffect, useRef, useState } from 'react';
import './RussianDateTimePicker.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export interface RussianDateTimeValue {
  iso: string;
  isUtc: boolean;
}

interface RussianDateTimePickerProps {
  id: string;
  label: string;
  value: RussianDateTimeValue;
  onChange: (value: RussianDateTimeValue) => void;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateToRussian(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function timeToRussian(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseRussianDate(str: string): Date | null {
  const match = str.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function parseRussianTime(str: string): { hours: number; minutes: number } | null {
  const match = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Маска ввода времени: только цифры, формат ЧЧ:ММ (24-часовой).
 * Лишние символы отбрасываются, часы ≤ 23, минуты ≤ 59.
 */
export function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return '';

  if (digits.length <= 2) {
    const hours = Number(digits);
    if (hours > 23) return '23';
    return digits;
  }

  let hh = digits.slice(0, 2);
  let mm = digits.slice(2);

  if (Number(hh) > 23) hh = '23';

  if (mm.length === 1) {
    const firstMinuteDigit = Number(mm);
    if (firstMinuteDigit > 5) mm = `0${firstMinuteDigit}`;
  } else if (mm.length >= 2) {
    mm = mm.slice(0, 2);
    if (Number(mm) > 59) mm = '59';
  }

  return `${hh}:${mm}`;
}

/** Доводит частично введённое время до ЧЧ:ММ при потере фокуса */
export function normalizeTimeOnBlur(timeStr: string): string {
  if (!timeStr.trim()) return '';
  if (parseRussianTime(timeStr)) return timeStr;

  const digits = timeStr.replace(/\D/g, '');
  if (digits.length === 0) return '';

  const padded = digits.length <= 2 ? `${digits}00` : digits.padEnd(4, '0');
  const masked = maskTimeInput(padded.slice(0, 4));
  return parseRussianTime(masked) ? masked : '';
}

export function toIsoString(dateStr: string, timeStr: string): string | null {
  const date = parseRussianDate(dateStr);
  const time = parseRussianTime(timeStr);
  if (!date || !time) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(time.hours)}:${pad(time.minutes)}:00`;
}

export function fromIsoString(iso: string): { dateStr: string; timeStr: string } {
  if (!iso?.trim()) {
    return { dateStr: '', timeStr: '' };
  }

  const trimmed = iso.trim();
  if (trimmed.includes('T')) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return { dateStr: dateToRussian(parsed), timeStr: timeToRussian(parsed) };
    }
  }

  const [datePart, timePart = '00:00:00'] = trimmed.split(' ');
  if (!datePart) {
    return { dateStr: '', timeStr: '' };
  }

  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0] = timePart.split(':').map(Number);

  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { dateStr: '', timeStr: '' };
  }

  const date = new Date(y, m - 1, d, hh, mm);
  if (Number.isNaN(date.getTime())) {
    return { dateStr: '', timeStr: '' };
  }

  return { dateStr: dateToRussian(date), timeStr: timeToRussian(date) };
}

export function createDefaultValue(offsetHours = 1): RussianDateTimeValue {
  const d = new Date();
  d.setHours(d.getHours() + offsetHours, 0, 0, 0);
  return {
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`,
    isUtc: false,
  };
}

function getCalendarDays(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function RussianDateTimePicker({ id, label, value, onChange }: RussianDateTimePickerProps) {
  const parsed = fromIsoString(value.iso);
  const [dateStr, setDateStr] = useState(parsed.dateStr);
  const [timeStr, setTimeStr] = useState(parsed.timeStr);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseRussianDate(parsed.dateStr) ?? new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = fromIsoString(value.iso);
    setDateStr(next.dateStr);
    setTimeStr(next.timeStr);
  }, [value.iso]);

  useEffect(() => {
    if (!calendarOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setCalendarOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [calendarOpen]);

  const emitIsoIfComplete = (nextDate: string, nextTime: string, isUtc = value.isUtc) => {
    const iso = toIsoString(nextDate, nextTime);
    // Обновляем родителя только при полной валидной паре дата+время.
    // Иначе при редактировании/удалении символов времени не сбрасывается дата.
    if (iso) {
      onChange({ iso, isUtc });
    }
  };

  const handleDateInput = (nextDate: string) => {
    setDateStr(nextDate);
    emitIsoIfComplete(nextDate, timeStr);
  };

  const handleTimeInput = (raw: string) => {
    const masked = maskTimeInput(raw);
    setTimeStr(masked);
    emitIsoIfComplete(dateStr, masked);
  };

  const handleTimeBlur = () => {
    if (!timeStr) return;

    const normalized = normalizeTimeOnBlur(timeStr);
    if (normalized === timeStr) {
      emitIsoIfComplete(dateStr, timeStr);
      return;
    }

    setTimeStr(normalized);
    emitIsoIfComplete(dateStr, normalized);
  };

  const handleToday = () => {
    const now = new Date();
    const nextDate = dateToRussian(now);
    const nextTime = timeToRussian(now);
    setDateStr(nextDate);
    setTimeStr(nextTime);
    emitIsoIfComplete(nextDate, nextTime);
    setViewMonth({ year: now.getFullYear(), month: now.getMonth() });
  };

  const handleClear = () => {
    setDateStr('');
    setTimeStr('');
    setCalendarOpen(false);
    const now = new Date();
    setViewMonth({ year: now.getFullYear(), month: now.getMonth() });
    onChange({ iso: '', isUtc: value.isUtc });
  };

  const selectDay = (day: Date) => {
    const nextDate = dateToRussian(day);
    const nextTime = timeStr && parseRussianTime(timeStr) ? timeStr : '00:00';
    setDateStr(nextDate);
    setTimeStr(nextTime);
    emitIsoIfComplete(nextDate, nextTime);
    setCalendarOpen(false);
  };

  const weeks = getCalendarDays(viewMonth.year, viewMonth.month);
  const selectedDate = parseRussianDate(dateStr);

  return (
    <div className="ru-datetime" ref={wrapRef}>
      <span className="form-field__label">{label}</span>

      <div className="ru-datetime__row">
        <div className="ru-datetime__date-wrap">
          <input
            id={`${id}-date`}
            className="form-field__input ru-datetime__input"
            value={dateStr}
            onChange={(e) => handleDateInput(e.target.value)}
            placeholder="ДД.ММ.ГГГГ"
            inputMode="numeric"
            aria-label={`${label}, дата`}
          />
          <button
            type="button"
            className="ru-datetime__calendar-btn"
            onClick={() => setCalendarOpen((v) => !v)}
            aria-label="Открыть календарь"
            title="Календарь"
          >
            📅
          </button>
          {calendarOpen && (
            <div className="ru-datetime__calendar">
              <div className="ru-datetime__cal-header">
                <button
                  type="button"
                  className="ru-datetime__cal-nav"
                  onClick={() =>
                    setViewMonth((v) =>
                      v.month === 0
                        ? { year: v.year - 1, month: 11 }
                        : { year: v.year, month: v.month - 1 },
                    )
                  }
                  aria-label="Предыдущий месяц"
                >
                  ‹
                </button>
                <span className="ru-datetime__cal-title">
                  {MONTHS[viewMonth.month]} {viewMonth.year}
                </span>
                <button
                  type="button"
                  className="ru-datetime__cal-nav"
                  onClick={() =>
                    setViewMonth((v) =>
                      v.month === 11
                        ? { year: v.year + 1, month: 0 }
                        : { year: v.year, month: v.month + 1 },
                    )
                  }
                  aria-label="Следующий месяц"
                >
                  ›
                </button>
              </div>
              <div className="ru-datetime__cal-weekdays">
                {WEEKDAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="ru-datetime__cal-week">
                  {week.map((day, di) =>
                    day ? (
                      <button
                        key={di}
                        type="button"
                        className={`ru-datetime__cal-day ${
                          selectedDate &&
                          day.getDate() === selectedDate.getDate() &&
                          day.getMonth() === selectedDate.getMonth() &&
                          day.getFullYear() === selectedDate.getFullYear()
                            ? 'ru-datetime__cal-day--selected'
                            : ''
                        }`}
                        onClick={() => selectDay(day)}
                      >
                        {day.getDate()}
                      </button>
                    ) : (
                      <span key={di} className="ru-datetime__cal-empty" />
                    ),
                  )}
                </div>
              ))}
              <div className="ru-datetime__cal-footer">
                <button type="button" className="ru-datetime__cal-action" onClick={handleToday}>
                  Сегодня
                </button>
                <button type="button" className="ru-datetime__cal-action" onClick={handleClear}>
                  Очистить
                </button>
              </div>
            </div>
          )}
        </div>

        <input
          id={`${id}-time`}
          className="form-field__input ru-datetime__time"
          value={timeStr}
          onChange={(e) => handleTimeInput(e.target.value)}
          onBlur={handleTimeBlur}
          placeholder="ЧЧ:ММ"
          inputMode="numeric"
          maxLength={5}
          autoComplete="off"
          aria-label={`${label}, время (24 ч)`}
        />
      </div>

      <div className="ru-datetime__tz">
        <label className="ru-datetime__tz-option">
          <input
            type="radio"
            name={`${id}-tz`}
            checked={!value.isUtc}
            onChange={() => onChange({ ...value, isUtc: false })}
          />
          Локальное время
        </label>
        <label className="ru-datetime__tz-option">
          <input
            type="radio"
            name={`${id}-tz`}
            checked={value.isUtc}
            onChange={() => onChange({ ...value, isUtc: true })}
          />
          UTC
        </label>
      </div>

      <span className="form-field__hint">
        Формат: {dateStr || 'ДД.ММ.ГГГГ'} {timeStr || 'ЧЧ:ММ'}
        {value.isUtc ? ' (UTC)' : ' (локальное)'}
      </span>
    </div>
  );
}
