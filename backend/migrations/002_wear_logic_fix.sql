-- Миграция: исправление логики износа (порог >= 100 ч, конфликт триггеров)
-- Применение: mysql -u aero_planer -p aero_planer < backend/migrations/002_wear_logic_fix.sql

USE aero_planer;

DELIMITER $$

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

DROP TRIGGER IF EXISTS trg_sync_drone_on_mission_status$$
CREATE TRIGGER trg_sync_drone_on_mission_status
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    IF NEW.status != OLD.status THEN
        IF NEW.status = 'Выполняется' THEN
            UPDATE drones SET status = 'В полете' WHERE id = NEW.drone_id;
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
            WHERE id = NEW.drone_id;
        END IF;
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_auto_block_drone_on_flight_hours$$
CREATE TRIGGER trg_auto_block_drone_on_flight_hours
AFTER UPDATE ON drones
FOR EACH ROW
BEGIN
    IF NEW.flight_hours >= 100.0 AND NEW.status NOT IN ('На ТО', 'Ремонт', 'Диагностика') THEN
        UPDATE drones SET status = 'На ТО' WHERE id = NEW.id;
    END IF;
END$$

DELIMITER ;
