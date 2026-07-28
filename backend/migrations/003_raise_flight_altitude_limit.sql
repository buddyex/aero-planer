-- Raise missions.flight_altitude_m ceiling from 500 m to 5000 m.

SET @db := DATABASE();

SET @chk := (
  SELECT cc.CONSTRAINT_NAME
  FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
  JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
   AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
  WHERE cc.CONSTRAINT_SCHEMA = @db
    AND tc.TABLE_NAME = 'missions'
    AND cc.CHECK_CLAUSE LIKE '%flight_altitude_m%'
    AND cc.CONSTRAINT_NAME <> 'chk_flight_altitude_m'
  LIMIT 1
);

SET @sql := IF(
  @chk IS NOT NULL,
  CONCAT('ALTER TABLE missions DROP CHECK `', @chk, '`'),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_named := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'missions'
    AND CONSTRAINT_NAME = 'chk_flight_altitude_m'
);

SET @sql2 := IF(
  @has_named = 0,
  'ALTER TABLE missions ADD CONSTRAINT chk_flight_altitude_m CHECK (flight_altitude_m BETWEEN 0 AND 5000)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
