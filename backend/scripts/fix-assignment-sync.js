/**
 * Применяет триггер переназначения ресурсов и выравнивает duty_status / status по активным миссиям.
 * Usage: node scripts/fix-assignment-sync.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mysql = require('mysql2/promise');
const config = require('../src/config');

const REASSIGN_TRIGGER = `
DROP TRIGGER IF EXISTS trg_sync_resources_on_mission_reassign;

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
END;
`;

async function repairAssignments(conn) {
  await conn.query("UPDATE operators SET duty_status = 'Свободен' WHERE role = 'Оператор'");

  await conn.query(`
    UPDATE operators o
    INNER JOIN missions m ON m.operator_id = o.id
    SET o.duty_status = CASE
      WHEN m.status = 'Выполняется' THEN 'В миссии'
      WHEN m.status IN ('К выполнению', 'Ожидает утверждения') THEN 'Запланирован'
      ELSE o.duty_status
    END
    WHERE o.role = 'Оператор'
      AND m.status IN ('К выполнению', 'Выполняется', 'Ожидает утверждения')
  `);

  await conn.query(`
    UPDATE drones d
    LEFT JOIN maintenance_logs ml ON ml.drone_id = d.id
      AND ml.closed_at IS NULL
      AND ml.work_type IN ('Плановое ТО', 'Ремонт', 'Диагностика')
    SET d.status = CASE
      WHEN ml.id IS NOT NULL THEN d.status
      WHEN EXISTS (
        SELECT 1 FROM missions m
        WHERE m.drone_id = d.id AND m.status = 'Выполняется'
      ) THEN 'В полете'
      WHEN EXISTS (
        SELECT 1 FROM missions m
        WHERE m.drone_id = d.id AND m.status = 'К выполнению'
      ) THEN 'Запланирован'
      ELSE 'Готов'
    END
    WHERE d.status IN ('Готов', 'Запланирован', 'В полете')
  `);
}

async function main() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
  });
  try {
    await conn.query(REASSIGN_TRIGGER);
    await repairAssignments(conn);
    const [operators] = await conn.query(
      'SELECT id, full_name, duty_status FROM operators WHERE role = ? ORDER BY id',
      ['Оператор'],
    );
    const [missions] = await conn.query(
      'SELECT id, title, operator_id, drone_id, status FROM missions ORDER BY start_time DESC',
    );
    console.log('Assignment sync completed.');
    console.log('Operators:', operators);
    console.log('Missions:', missions);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('fix-assignment-sync failed:', err.message);
  process.exit(1);
});
