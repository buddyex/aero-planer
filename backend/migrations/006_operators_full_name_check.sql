-- Жёсткое ФИО: Фамилия Имя Отчество (кириллица) + CHECK constraint.

-- 1) Нормализация существующих коротких значений под полный формат
UPDATE operators SET full_name = 'Иванов Алексей Сергеевич' WHERE full_name = 'Иванов А.С.';
UPDATE operators SET full_name = 'Петров Кирилл Викторович' WHERE full_name = 'Петров К.В.';
UPDATE operators SET full_name = 'Сидорова Мария Леонидовна' WHERE full_name = 'Сидорова М.Л.';
UPDATE operators SET full_name = 'Козлов Дмитрий Иванович' WHERE full_name = 'Козлов Д.И.';
UPDATE operators SET full_name = 'Николаев Роман Петрович' WHERE full_name = 'Николаев Р.П.';

-- 2) CHECK (идемпотентно)
SET @db := DATABASE();

SET @has_chk := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'operators'
    AND CONSTRAINT_NAME = 'chk_operators_full_name'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql_chk := IF(
  @has_chk = 0,
  'ALTER TABLE operators ADD CONSTRAINT chk_operators_full_name CHECK (
    full_name REGEXP ''^[А-ЯЁ][а-яё]+(-[А-ЯЁ][а-яё]+)? [А-ЯЁ][а-яё]+(-[А-ЯЁ][а-яё]+)? [А-ЯЁ][а-яё]+(-[А-ЯЁ][а-яё]+)?$''
  )',
  'SELECT 1'
);
PREPARE stmt_chk FROM @sql_chk;
EXECUTE stmt_chk;
DEALLOCATE PREPARE stmt_chk;
