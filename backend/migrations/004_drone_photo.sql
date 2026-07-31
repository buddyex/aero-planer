-- Add optional photo URL for fleet drones.

SET @db := DATABASE();

SET @has_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'drones'
    AND COLUMN_NAME = 'photo_url'
);

SET @sql := IF(
  @has_col = 0,
  'ALTER TABLE drones ADD COLUMN photo_url VARCHAR(512) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
