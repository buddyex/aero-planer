/** Фамилия Имя Отчество: кириллица, опциональный дефис в каждой части. */
const FULL_NAME_RE =
  /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)? [А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)? [А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/;

export const FULL_NAME_ERROR =
  'ФИО должно быть полностью: Фамилия Имя Отчество (кириллица).';

export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isValidFullName(value: string): boolean {
  return FULL_NAME_RE.test(normalizeFullName(value));
}

/** Иванов Иван Сергеевич → Иванов И.С. */
export function formatShortFio(fullName: string | null | undefined): string {
  if (!fullName) return '—';
  const normalized = normalizeFullName(fullName);
  const parts = normalized.split(' ');
  if (parts.length < 3) return normalized;
  const [surname, first, patronymic] = parts;
  if (!surname || !first || !patronymic) return normalized;
  return `${surname} ${first.charAt(0)}.${patronymic.charAt(0)}.`;
}

export function fioAvatarLetter(fullName: string | null | undefined): string {
  if (!fullName) return '?';
  const letter = normalizeFullName(fullName).charAt(0);
  return letter || '?';
}
