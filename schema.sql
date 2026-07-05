-- Aero-Planer MySQL Schema
-- Deploy: mysql -u root -p < schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS aero_planer
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE aero_planer;

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS sync_queue;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS battery_inspection_logs;
DROP TABLE IF EXISTS maintenance_logs;
DROP TABLE IF EXISTS weather_logs;
DROP TABLE IF EXISTS missions;
DROP TABLE IF EXISTS batteries;
DROP TABLE IF EXISTS weather_risk_matrix;
DROP TABLE IF EXISTS sectors;
DROP TABLE IF EXISTS operators;
DROP TABLE IF EXISTS drones;
DROP TABLE IF EXISTS drone_models;

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================
-- 1. СПРАВОЧНИКИ И ПЕРСОНАЛ
-- ==========================================

CREATE TABLE drone_models (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model_name VARCHAR(128) NOT NULL UNIQUE,
    max_wind_speed DOUBLE NOT NULL,
    min_temp DOUBLE NOT NULL,
    max_temp DOUBLE NOT NULL,
    requires_clear_sky TINYINT NOT NULL CHECK (requires_clear_sky IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE drones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    serial_number VARCHAR(64) NOT NULL UNIQUE,
    max_wind_speed DOUBLE NOT NULL CHECK (max_wind_speed > 0),
    battery_capacity INT NOT NULL CHECK (battery_capacity > 0),
    payload_capacity DOUBLE NOT NULL CHECK (payload_capacity > 0),
    flight_time_max INT NOT NULL CHECK (flight_time_max > 0),
    flight_hours DOUBLE NOT NULL DEFAULT 0 CHECK (flight_hours >= 0),
    status ENUM('Готов','Запланирован','На ТО','Ремонт','Диагностика','В полете') NOT NULL DEFAULT 'Готов'
) ENGINE=InnoDB;

CREATE TABLE operators (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(128) NOT NULL,
    login VARCHAR(64) NOT NULL UNIQUE,
    pin_code VARCHAR(16) NOT NULL DEFAULT '',
    pin_hash VARCHAR(128) NULL,
    pin_salt VARCHAR(64) NULL,
    role ENUM('Администратор','Руководитель','Техник','Оператор') NOT NULL,
    duty_status ENUM('Свободен','Запланирован','В миссии') NOT NULL DEFAULT 'Свободен'
) ENGINE=InnoDB;

CREATE TABLE sectors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sector_name VARCHAR(128) NOT NULL,
    risk_level ENUM('Низкий','Средний','Высокий') NOT NULL DEFAULT 'Низкий',
    center_lat DOUBLE NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
    center_lon DOUBLE NOT NULL CHECK (center_lon BETWEEN -180 AND 180),
    radius_km DOUBLE NOT NULL DEFAULT 20 CHECK (radius_km BETWEEN 5 AND 60),
    boundary_polygon LONGTEXT NULL,
    shape_type ENUM('circle','polygon') NOT NULL DEFAULT 'circle',
    is_active TINYINT NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

-- ==========================================
-- 2. ПРОЦЕССЫ И МОНИТОРИНГ
-- ==========================================

CREATE TABLE batteries (
    id CHAR(36) PRIMARY KEY,
    serial_number VARCHAR(64) NOT NULL UNIQUE,
    type ENUM('LiPo','LiIon') NOT NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    cycle_count INT NOT NULL DEFAULT 0 CHECK (cycle_count >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'Отлично'
        CHECK (status IN ('Отлично', 'Требуется проверка', 'Списано'))
) ENGINE=InnoDB;

CREATE TABLE missions (
    id CHAR(36) PRIMARY KEY,
    title VARCHAR(256) NOT NULL,
    operator_id INT NOT NULL,
    drone_id INT NOT NULL,
    battery_id CHAR(36) NOT NULL,
    sector_id INT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    creator_id INT NULL,
    approved_by_id INT NULL,
    route_geometry LONGTEXT NULL,
    status ENUM(
        'Ожидает утверждения','К выполнению',
        'Выполняется','Завершено','Отменено','Отклонено'
    ) NOT NULL DEFAULT 'К выполнению',
    flight_radius_m DOUBLE NOT NULL DEFAULT 500 CHECK (flight_radius_m BETWEEN 50 AND 50000),
    flight_altitude_m DOUBLE NOT NULL DEFAULT 120 CHECK (flight_altitude_m BETWEEN 0 AND 500),
    sync_status TINYINT NOT NULL DEFAULT 0 CHECK (sync_status IN (0, 1)),
    CONSTRAINT check_dates CHECK (start_time < end_time),
    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE RESTRICT,
    FOREIGN KEY (drone_id) REFERENCES drones(id) ON DELETE RESTRICT,
    FOREIGN KEY (battery_id) REFERENCES batteries(id) ON DELETE RESTRICT,
    FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE RESTRICT,
    FOREIGN KEY (creator_id) REFERENCES operators(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by_id) REFERENCES operators(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE weather_logs (
    id CHAR(36) PRIMARY KEY,
    sector_id INT NOT NULL,
    wind_speed DOUBLE NOT NULL,
    temperature DOUBLE NOT NULL,
    precipitation ENUM('Ясно','Дождь','Снег','Туман') NOT NULL,
    weather_source ENUM('CheckWX','NOAA','OpenMeteo','Manual') NOT NULL DEFAULT 'OpenMeteo',
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sync_status TINYINT NOT NULL DEFAULT 0 CHECK (sync_status IN (0, 1)),
    FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE weather_risk_matrix (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parameter_type ENUM('Ветер','Температура','Осадки') NOT NULL,
    condition_operator ENUM('>','<','=') NOT NULL,
    threshold_value DOUBLE NOT NULL,
    resulting_risk ENUM('Средний','Высокий') NOT NULL
) ENGINE=InnoDB;

CREATE TABLE maintenance_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drone_id INT NOT NULL,
    operator_id INT NOT NULL,
    maintenance_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    work_type ENUM('Плановое ТО','Ремонт','Диагностика') NOT NULL,
    description TEXT NULL,
    hours_at_service DOUBLE NULL,
    closed_at DATETIME NULL,
    FOREIGN KEY (drone_id) REFERENCES drones(id) ON DELETE CASCADE,
    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE battery_inspection_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    battery_id CHAR(36) NOT NULL,
    operator_id INT NOT NULL,
    inspection_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    cycle_count_at_inspection INT NOT NULL CHECK (cycle_count_at_inspection >= 0),
    visual_ok TINYINT NOT NULL CHECK (visual_ok IN (0, 1)),
    connectors_ok TINYINT NOT NULL CHECK (connectors_ok IN (0, 1)),
    balance_ok TINYINT NOT NULL CHECK (balance_ok IN (0, 1)),
    test_cycle_ok TINYINT NOT NULL CHECK (test_cycle_ok IN (0, 1)),
    capacity_percent DOUBLE NOT NULL CHECK (capacity_percent BETWEEN 0 AND 100),
    result ENUM('Пройдена','Не пройдена') NOT NULL,
    notes TEXT NULL,
    FOREIGN KEY (battery_id) REFERENCES batteries(id) ON DELETE CASCADE,
    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ==========================================
-- 3. СИСТЕМНЫЕ ТАБЛИЦЫ
-- ==========================================

CREATE TABLE audit_logs (
    id CHAR(36) PRIMARY KEY,
    operator_id INT NULL,
    action_text TEXT NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sync_status TINYINT NOT NULL DEFAULT 0 CHECK (sync_status IN (0, 1)),
    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE sync_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    record_id CHAR(36) NOT NULL,
    target_table VARCHAR(64) NOT NULL,
    operation ENUM('INSERT','UPDATE','DELETE') NOT NULL,
    synced TINYINT NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE messages (
    id CHAR(36) PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    text TEXT NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sync_status TINYINT NOT NULL DEFAULT 0 CHECK (sync_status IN (0, 1)),
    is_read TINYINT NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    FOREIGN KEY (sender_id) REFERENCES operators(id) ON DELETE RESTRICT,
    FOREIGN KEY (receiver_id) REFERENCES operators(id) ON DELETE RESTRICT,
    CHECK (sender_id != receiver_id),
    CHECK (CHAR_LENGTH(TRIM(text)) > 0)
) ENGINE=InnoDB;

CREATE INDEX idx_missions_status ON missions(status);
CREATE INDEX idx_missions_battery ON missions(battery_id);
CREATE INDEX idx_weather_logs_sector ON weather_logs(sector_id, timestamp DESC);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_messages_receiver ON messages(receiver_id, is_read);

-- ==========================================
-- 4. ТРИГГЕРЫ
-- ==========================================

DELIMITER $$

CREATE TRIGGER trg_sectors_unique_active_name
BEFORE INSERT ON sectors
FOR EACH ROW
BEGIN
    IF NEW.is_active = 1 AND EXISTS (
        SELECT 1 FROM sectors s
        WHERE s.sector_name = NEW.sector_name AND s.is_active = 1
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Сектор с таким именем уже существует.';
    END IF;
END$$

CREATE TRIGGER trg_sectors_unique_active_name_upd
BEFORE UPDATE ON sectors
FOR EACH ROW
BEGIN
    IF NEW.is_active = 1 AND EXISTS (
        SELECT 1 FROM sectors s
        WHERE s.sector_name = NEW.sector_name AND s.is_active = 1 AND s.id != NEW.id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Сектор с таким именем уже существует.';
    END IF;
END$$

CREATE TRIGGER trg_sync_drone_status_on_maintenance_insert
AFTER INSERT ON maintenance_logs
FOR EACH ROW
BEGIN
    IF NEW.work_type IN ('Плановое ТО', 'Ремонт', 'Диагностика') AND NEW.closed_at IS NULL THEN
        UPDATE drones SET status = CASE
            WHEN NEW.work_type = 'Ремонт' THEN 'Ремонт'
            WHEN NEW.work_type = 'Диагностика' THEN 'Диагностика'
            ELSE 'На ТО'
        END WHERE id = NEW.drone_id;
    END IF;
END$$

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

    IF v_flight_hours > 100.0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ошибка АСОИУ: Превышен лимит налёта (>100 ч). Требуется плановое ТО.';
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

CREATE TRIGGER trg_sync_resources_after_mission_insert
AFTER INSERT ON missions
FOR EACH ROW
BEGIN
    IF NEW.status = 'К выполнению' THEN
        UPDATE drones SET status = 'Запланирован' WHERE id = NEW.drone_id;
        UPDATE operators SET duty_status = 'Запланирован'
        WHERE id = NEW.operator_id AND role = 'Оператор';
    END IF;
END$$

CREATE TRIGGER trg_sync_resources_on_mission_approve
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    IF OLD.status = 'Ожидает утверждения' AND NEW.status = 'К выполнению' THEN
        UPDATE drones SET status = 'Запланирован' WHERE id = NEW.drone_id;
        UPDATE operators SET duty_status = 'Запланирован'
        WHERE id = NEW.operator_id AND role = 'Оператор';
    END IF;
END$$

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
                UPDATE drones SET status = 'В полете' WHERE id = NEW.drone_id;
            ELSEIF NEW.status = 'К выполнению' THEN
                UPDATE drones SET status = 'Запланирован' WHERE id = NEW.drone_id;
            END IF;
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_auto_calculate_sector_risk
AFTER INSERT ON weather_logs
FOR EACH ROW
BEGIN
    UPDATE sectors SET risk_level = CASE
        WHEN NEW.wind_speed > 14.0 OR NEW.temperature < -20.0 THEN 'Высокий'
        WHEN NEW.wind_speed BETWEEN 9.0 AND 14.0 OR NEW.precipitation = 'Туман' THEN 'Средний'
        ELSE 'Низкий'
    END WHERE id = NEW.sector_id;
END$$

CREATE TRIGGER trg_queue_mission_updates
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    INSERT INTO sync_queue (record_id, target_table, operation, synced)
    VALUES (NEW.id, 'missions', 'UPDATE', 0);
END$$

CREATE TRIGGER trg_validate_mission_status_transition
BEFORE UPDATE ON missions
FOR EACH ROW
BEGIN
    DECLARE v_drone_status VARCHAR(32);
    DECLARE v_op_role VARCHAR(32);
    DECLARE v_op_duty VARCHAR(32);

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

CREATE TRIGGER trg_sync_drone_on_mission_status
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    IF NEW.status != OLD.status THEN
        IF NEW.status = 'Выполняется' THEN
            UPDATE drones SET status = 'В полете' WHERE id = NEW.drone_id;
        END IF;
        IF NEW.status IN ('Завершено', 'Отменено') AND OLD.status IN ('Выполняется', 'К выполнению') THEN
            UPDATE drones SET status = 'Готов'
            WHERE id = NEW.drone_id
              AND NOT EXISTS (
                SELECT 1 FROM maintenance_logs ml
                WHERE ml.drone_id = NEW.drone_id
                  AND ml.closed_at IS NULL
                  AND ml.work_type IN ('Плановое ТО', 'Ремонт', 'Диагностика')
              );
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_increment_battery_cycle_on_complete
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    IF NEW.status = 'Завершено' AND OLD.status = 'Выполняется' AND NEW.battery_id IS NOT NULL THEN
        UPDATE batteries SET
            cycle_count = cycle_count + 1,
            status = CASE
                WHEN MOD(cycle_count + 1, 50) = 0 THEN 'Требуется проверка'
                ELSE status
            END
        WHERE id = NEW.battery_id;
    END IF;
END$$

CREATE TRIGGER trg_sync_battery_status_after_inspection
AFTER INSERT ON battery_inspection_logs
FOR EACH ROW
BEGIN
    UPDATE batteries SET status = CASE
        WHEN NEW.result = 'Пройдена' THEN 'Отлично'
        WHEN NEW.result = 'Не пройдена' THEN 'Списано'
        ELSE status
    END WHERE id = NEW.battery_id;
END$$

CREATE TRIGGER trg_accumulate_flight_hours_on_complete
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    IF NEW.status = 'Завершено' AND OLD.status = 'Выполняется' THEN
        UPDATE drones SET flight_hours = flight_hours +
            (TIMESTAMPDIFF(SECOND, NEW.start_time, NEW.end_time) / 3600.0)
        WHERE id = NEW.drone_id;
    END IF;
END$$

CREATE TRIGGER trg_auto_block_drone_on_flight_hours
AFTER UPDATE ON drones
FOR EACH ROW
BEGIN
    IF NEW.flight_hours > 100.0 AND NEW.status NOT IN ('На ТО', 'Ремонт', 'Диагностика') THEN
        UPDATE drones SET status = 'На ТО' WHERE id = NEW.id;
    END IF;
END$$

CREATE TRIGGER trg_sync_operator_on_mission_status
AFTER UPDATE ON missions
FOR EACH ROW
BEGIN
    IF NEW.status != OLD.status THEN
        IF NEW.status = 'Выполняется' THEN
            UPDATE operators SET duty_status = 'В миссии'
            WHERE id = NEW.operator_id AND role = 'Оператор';
        END IF;
        IF NEW.status IN ('Завершено', 'Отменено', 'Отклонено') THEN
            UPDATE operators SET duty_status = 'Свободен'
            WHERE id = NEW.operator_id AND role = 'Оператор';
        END IF;
    END IF;
END$$

DELIMITER ;
