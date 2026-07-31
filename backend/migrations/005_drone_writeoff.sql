-- Списание бортов: статус «Списан», поля списания, защита sync-триггеров.

SET @db := DATABASE();

-- 1) ENUM + columns
ALTER TABLE drones
  MODIFY COLUMN status ENUM(
    'Готов','Запланирован','На ТО','Ремонт','Диагностика','В полете','Списан'
  ) NOT NULL DEFAULT 'Готов';

SET @has_wo_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'drones' AND COLUMN_NAME = 'written_off_at'
);
SET @sql_wo_at := IF(
  @has_wo_at = 0,
  'ALTER TABLE drones ADD COLUMN written_off_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt_wo_at FROM @sql_wo_at;
EXECUTE stmt_wo_at;
DEALLOCATE PREPARE stmt_wo_at;

SET @has_wo_reason := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'drones' AND COLUMN_NAME = 'written_off_reason'
);
SET @sql_wo_reason := IF(
  @has_wo_reason = 0,
  'ALTER TABLE drones ADD COLUMN written_off_reason VARCHAR(512) NULL',
  'SELECT 1'
);
PREPARE stmt_wo_reason FROM @sql_wo_reason;
EXECUTE stmt_wo_reason;
DEALLOCATE PREPARE stmt_wo_reason;

DELIMITER $$

-- 2) Maintenance: запрет ТО на списанный + sync статуса без воскрешения
DROP TRIGGER IF EXISTS trg_block_maintenance_on_written_off$$
CREATE TRIGGER trg_block_maintenance_on_written_off
BEFORE INSERT ON maintenance_logs
FOR EACH ROW
BEGIN
    DECLARE v_drone_status VARCHAR(32);
    SELECT status INTO v_drone_status FROM drones WHERE id = NEW.drone_id;
    IF v_drone_status = 'Списан' THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Ошибка АСОИУ: нельзя открыть ТО на списанный борт.';
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_sync_drone_status_on_maintenance_insert$$
CREATE TRIGGER trg_sync_drone_status_on_maintenance_insert
AFTER INSERT ON maintenance_logs
FOR EACH ROW
BEGIN
    IF NEW.work_type IN ('Плановое ТО', 'Ремонт', 'Диагностика') AND NEW.closed_at IS NULL THEN
        UPDATE drones SET status = CASE
            WHEN NEW.work_type = 'Ремонт' THEN 'Ремонт'
            WHEN NEW.work_type = 'Диагностика' THEN 'Диагностика'
            ELSE 'На ТО'
        END
        WHERE id = NEW.drone_id AND status <> 'Списан';
    END IF;
END$$

-- 3) Mission insert: списанный запрещён всегда (в т.ч. «Ожидает утверждения»)
DROP TRIGGER IF EXISTS trg_check_mission_before_insert$$
CREATE TRIGGER trg_check_mission_before_insert
BEFORE INSERT ON missions
FOR EACH ROW
BEGIN
    DECLARE v_flight_hours DOUBLE;
    DECLARE v_battery_status VARCHAR(32);
    DECLARE v_drone_status VARCHAR(32);
    DECLARE v_op_role VARCHAR(32);
    DECLARE v_op_duty VARCHAR(32);

    SELECT flight_hours, status INTO v_flight_hours, v_drone_status FROM drones WHERE id = NEW.drone_id;
    SELECT status INTO v_battery_status FROM batteries WHERE id = NEW.battery_id;
    SELECT role, duty_status INTO v_op_role, v_op_duty FROM operators WHERE id = NEW.operator_id;

    IF v_drone_status = 'Списан' THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Ошибка АСОИУ: борт списан и недоступен для назначения на миссии.';
    END IF;
    IF v_flight_hours >= 100.0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: Превышен лимит налёта (>=100 ч). Требуется плановое ТО.';
    END IF;
    IF NEW.battery_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: Не указан аккумулятор (АКБ) для миссии.';
    END IF;
    IF v_battery_status != 'Отлично' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: АКБ недоступна (статус не «Отлично»).';
    END IF;
    IF NEW.status != 'Ожидает утверждения' AND v_drone_status != 'Готов' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: Борт БПЛА недоступен (не готов, уже запланирован или в полёте).';
    END IF;
    IF NEW.status != 'Ожидает утверждения' AND v_op_role = 'Оператор' AND v_op_duty != 'Свободен' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: Оператор уже назначен на другую миссию.';
    END IF;
    IF NEW.status != 'Ожидает утверждения' AND EXISTS (
        SELECT 1 FROM missions m
        WHERE m.drone_id = NEW.drone_id
          AND m.status IN ('К выполнению', 'Выполняется')
          AND NEW.start_time < m.end_time AND NEW.end_time > m.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: Борт уже запланирован на другую миссию в это время.';
    END IF;
    IF NEW.status != 'Ожидает утверждения' AND EXISTS (
        SELECT 1 FROM missions m
        WHERE m.operator_id = NEW.operator_id
          AND m.status IN ('К выполнению', 'Выполняется')
          AND NEW.start_time < m.end_time AND NEW.end_time > m.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: Оператор уже назначен на другую миссию в это время.';
    END IF;
    IF NEW.status != 'Ожидает утверждения' AND EXISTS (
        SELECT 1 FROM missions m
        WHERE m.battery_id = NEW.battery_id
          AND m.status IN ('К выполнению', 'Выполняется')
          AND NEW.start_time < m.end_time AND NEW.end_time > m.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: АКБ уже назначена на другую миссию в это время.';
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_sync_resources_after_mission_insert$$
CREATE TRIGGER trg_sync_resources_after_mission_insert
AFTER INSERT ON missions
FOR EACH ROW
BEGIN
    IF NEW.status = 'К выполнению' THEN
        UPDATE drones SET status = 'Запланирован'
        WHERE id = NEW.drone_id AND status <> 'Списан';
        UPDATE operators SET duty_status = 'Запланирован'
        WHERE id = NEW.operator_id AND role = 'Оператор';
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_sync_resources_on_mission_approve$$
CREATE TRIGGER trg_sync_resources_on_mission_approve
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    IF OLD.status = 'Ожидает утверждения' AND NEW.status = 'К выполнению' THEN
        UPDATE drones SET status = 'Запланирован'
        WHERE id = NEW.drone_id AND status <> 'Списан';
        UPDATE operators SET duty_status = 'Запланирован'
        WHERE id = NEW.operator_id AND role = 'Оператор';
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_sync_resources_on_mission_reassign$$
CREATE TRIGGER trg_sync_resources_on_mission_reassign
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    IF NEW.status IN ('К выполнению', 'Ожидает утверждения', 'Выполняется') THEN
        IF OLD.operator_id != NEW.operator_id THEN
            UPDATE operators SET duty_status = 'Свободен'
            WHERE id = OLD.operator_id AND role = 'Оператор'
              AND NOT EXISTS (
                SELECT 1 FROM missions m
                WHERE m.operator_id = OLD.operator_id
                  AND m.id != NEW.id
                  AND m.status IN ('К выполнению', 'Выполняется', 'Ожидает утверждения')
              );

            IF NEW.status = 'Выполняется' THEN
                UPDATE operators SET duty_status = 'В миссии'
                WHERE id = NEW.operator_id AND role = 'Оператор';
            ELSEIF NEW.status = 'К выполнению' THEN
                UPDATE operators SET duty_status = 'Запланирован'
                WHERE id = NEW.operator_id AND role = 'Оператор';
            END IF;
        END IF;

        IF OLD.drone_id != NEW.drone_id THEN
            UPDATE drones SET status = 'Готов'
            WHERE id = OLD.drone_id
              AND status <> 'Списан'
              AND NOT EXISTS (
                SELECT 1 FROM missions m
                WHERE m.drone_id = OLD.drone_id
                  AND m.id != NEW.id
                  AND m.status IN ('К выполнению', 'Выполняется')
              )
              AND NOT EXISTS (
                SELECT 1 FROM maintenance_logs ml
                WHERE ml.drone_id = OLD.drone_id
                  AND ml.closed_at IS NULL
                  AND ml.work_type IN ('Плановое ТО', 'Ремонт', 'Диагностика')
              );

            IF NEW.status = 'Выполняется' THEN
                UPDATE drones SET status = 'В полете'
                WHERE id = NEW.drone_id AND status <> 'Списан';
            ELSEIF NEW.status = 'К выполнению' THEN
                UPDATE drones SET status = 'Запланирован'
                WHERE id = NEW.drone_id AND status <> 'Списан';
            END IF;
        END IF;
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_validate_mission_status_transition$$
CREATE TRIGGER trg_validate_mission_status_transition
BEFORE UPDATE ON missions
FOR EACH ROW
BEGIN
    DECLARE v_drone_status VARCHAR(32);
    DECLARE v_op_role VARCHAR(32);
    DECLARE v_op_duty VARCHAR(32);

    IF NEW.drone_id != OLD.drone_id THEN
        SELECT status INTO v_drone_status FROM drones WHERE id = NEW.drone_id;
        IF v_drone_status = 'Списан' THEN
            SIGNAL SQLSTATE '45000'
              SET MESSAGE_TEXT = 'Ошибка АСОИУ: борт списан и недоступен для назначения на миссии.';
        END IF;
    END IF;

    IF NEW.status != OLD.status THEN
        IF OLD.status IN ('Завершено', 'Отменено', 'Отклонено') THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Миссия уже закрыта и не может быть изменена.';
        END IF;
        IF NEW.status = 'Выполняется' AND OLD.status != 'К выполнению' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Запуск возможен только из статуса «К выполнению».';
        END IF;
        IF NEW.status = 'Завершено' AND OLD.status != 'Выполняется' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Завершить можно только выполняющуюся миссию.';
        END IF;
        IF NEW.status = 'Отменено' AND OLD.status NOT IN ('К выполнению', 'Выполняется') THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Отмена недоступна для текущего статуса.';
        END IF;
        IF NEW.status = 'Отклонено' AND OLD.status != 'Ожидает утверждения' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Отклонить можно только миссию, ожидающую утверждения.';
        END IF;
        IF NEW.status = 'К выполнению' AND OLD.status NOT IN ('Ожидает утверждения') THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Утвердить можно только миссию, ожидающую утверждения.';
        END IF;

        SELECT status INTO v_drone_status FROM drones WHERE id = NEW.drone_id;
        SELECT role, duty_status INTO v_op_role, v_op_duty FROM operators WHERE id = NEW.operator_id;

        IF NEW.status IN ('К выполнению', 'Выполняется') AND v_drone_status = 'Списан' THEN
            SIGNAL SQLSTATE '45000'
              SET MESSAGE_TEXT = 'Ошибка АСОИУ: борт списан и недоступен для назначения на миссии.';
        END IF;
        IF NEW.status = 'Выполняется' AND v_drone_status != 'Запланирован' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: Борт не зарезервирован под эту миссию.';
        END IF;
        IF NEW.status = 'Выполняется' AND v_op_role = 'Оператор' AND v_op_duty != 'Запланирован' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: Оператор не зарезервирован под эту миссию.';
        END IF;
        IF NEW.status = 'Выполняется' AND EXISTS (
            SELECT 1 FROM missions WHERE drone_id = NEW.drone_id AND id != NEW.id AND status = 'Выполняется'
        ) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Борт уже участвует в другой активной миссии.';
        END IF;
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_sync_drone_on_mission_status$$
CREATE TRIGGER trg_sync_drone_on_mission_status
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    IF NEW.status != OLD.status THEN
        IF NEW.status = 'Выполняется' THEN
            UPDATE drones SET status = 'В полете'
            WHERE id = NEW.drone_id AND status <> 'Списан';
        END IF;
        IF NEW.status IN ('Завершено', 'Отменено') AND OLD.status IN ('Выполняется', 'К выполнению') THEN
            UPDATE drones SET status = CASE
                WHEN flight_hours >= 100.0 THEN 'На ТО'
                WHEN NOT EXISTS (
                    SELECT 1 FROM maintenance_logs ml
                    WHERE ml.drone_id = NEW.drone_id
                      AND ml.closed_at IS NULL
                      AND ml.work_type IN ('Плановое ТО', 'Ремонт', 'Диагностика')
                ) THEN 'Готов'
                ELSE status
            END
            WHERE id = NEW.drone_id AND status <> 'Списан';
        END IF;
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_auto_block_drone_on_flight_hours$$
CREATE TRIGGER trg_auto_block_drone_on_flight_hours
AFTER UPDATE ON drones
FOR EACH ROW
BEGIN
    IF NEW.flight_hours >= 100.0
       AND NEW.status NOT IN ('На ТО', 'Ремонт', 'Диагностика', 'Списан') THEN
        UPDATE drones SET status = 'На ТО' WHERE id = NEW.id AND status <> 'Списан';
    END IF;
END$$

DELIMITER ;
