const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const {
  BATTERY_INSPECTION_CYCLE_INTERVAL,
  BATTERY_MIN_CAPACITY_PERCENT,
  requiresInspectionAtCycle,
  validateBatteryInspectionPayload,
} = require('../backend/src/lib/battery-rules');

function openDb(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function setupBatteryTestSchema(db) {
  await run(db, 'PRAGMA foreign_keys = ON;');
  await run(db, `
    CREATE TABLE batteries (
      id TEXT PRIMARY KEY,
      serial_number TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      cycle_count INTEGER NOT NULL DEFAULT 0 CHECK(cycle_count >= 0),
      status TEXT NOT NULL DEFAULT 'Отлично'
        CHECK(status IN ('Отлично', 'Требуется проверка', 'Списано'))
    )
  `);
  await run(db, `
    CREATE TABLE missions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      drone_id INTEGER NOT NULL,
      battery_id TEXT NOT NULL,
      sector_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Запланировано', 'Выполняется', 'Завершено', 'Отменено')) DEFAULT 'Запланировано',
      FOREIGN KEY (battery_id) REFERENCES batteries(id)
    )
  `);
  await run(db, `
    CREATE TRIGGER increment_battery_cycle_on_complete
    AFTER UPDATE OF status ON missions
    FOR EACH ROW
    WHEN NEW.status = 'Завершено' AND OLD.status = 'Выполняется' AND NEW.battery_id IS NOT NULL
    BEGIN
        UPDATE batteries
        SET cycle_count = cycle_count + 1,
            status = CASE
                WHEN (cycle_count + 1) % ${BATTERY_INSPECTION_CYCLE_INTERVAL} = 0 THEN 'Требуется проверка'
                ELSE status
            END
        WHERE id = NEW.battery_id;
    END;
  `);
  await run(db, `
    CREATE TRIGGER check_mission_before_insert
    BEFORE INSERT ON missions
    FOR EACH ROW
    BEGIN
        SELECT CASE
            WHEN (SELECT status FROM batteries WHERE id = NEW.battery_id) != 'Отлично'
            THEN RAISE(ABORT, 'Ошибка АСОИУ: АКБ недоступна (статус не «Отлично»).')
        END;
    END;
  `);
  await run(db, `
    CREATE TABLE operators (
      id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL
    )
  `);
  await run(db, `INSERT INTO operators (id, full_name) VALUES (4, 'Техник')`);
  await run(db, `
    CREATE TABLE battery_inspection_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      battery_id TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      inspection_date TEXT NOT NULL DEFAULT CURRENT_DATE,
      cycle_count_at_inspection INTEGER NOT NULL CHECK(cycle_count_at_inspection >= 0),
      visual_ok INTEGER NOT NULL CHECK(visual_ok IN (0, 1)),
      connectors_ok INTEGER NOT NULL CHECK(connectors_ok IN (0, 1)),
      balance_ok INTEGER NOT NULL CHECK(balance_ok IN (0, 1)),
      test_cycle_ok INTEGER NOT NULL CHECK(test_cycle_ok IN (0, 1)),
      capacity_percent REAL NOT NULL CHECK(capacity_percent BETWEEN 0 AND 100),
      result TEXT NOT NULL CHECK(result IN ('Пройдена', 'Не пройдена')),
      notes TEXT,
      FOREIGN KEY (battery_id) REFERENCES batteries(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES operators(id)
    )
  `);
  await run(db, `
    CREATE TRIGGER sync_battery_status_after_inspection
    AFTER INSERT ON battery_inspection_logs
    FOR EACH ROW
    BEGIN
        UPDATE batteries
        SET status = CASE
            WHEN NEW.result = 'Пройдена' THEN 'Отлично'
            WHEN NEW.result = 'Не пройдена' THEN 'Списано'
            ELSE status
        END
        WHERE id = NEW.battery_id;
    END;
  `);
}

async function completeMission(db, batteryId, missionId) {
  await run(
    db,
    `INSERT INTO missions (id, title, operator_id, drone_id, battery_id, sector_id, start_time, end_time, status)
     VALUES (?, 'Test', 1, 1, ?, 1, '2026-01-01 10:00:00', '2026-01-01 11:00:00', 'Выполняется')`,
    [missionId, batteryId],
  );
  await run(db, `UPDATE missions SET status = 'Завершено' WHERE id = ?`, [missionId]);
}

describe('battery-rules', () => {
  test('порог проверки = 50 циклов', () => {
    expect(BATTERY_INSPECTION_CYCLE_INTERVAL).toBe(50);
    expect(BATTERY_MIN_CAPACITY_PERCENT).toBe(80);
  });

  test('requiresInspectionAtCycle срабатывает на 50 и 100', () => {
    expect(requiresInspectionAtCycle(50)).toBe(true);
    expect(requiresInspectionAtCycle(100)).toBe(true);
    expect(requiresInspectionAtCycle(51)).toBe(false);
    expect(requiresInspectionAtCycle(49)).toBe(false);
  });

  test('validateBatteryInspectionPayload отклоняет ёмкость ниже 80%', () => {
    const result = validateBatteryInspectionPayload(
      {
        visual_ok: true,
        connectors_ok: true,
        balance_ok: true,
        test_cycle_ok: true,
        capacity_percent: 79,
        result: 'Пройдена',
      },
      'Требуется проверка',
    );
    expect(result.ok).toBe(false);
  });

  test('validateBatteryInspectionPayload требует комментарий при «Не пройдена»', () => {
    const result = validateBatteryInspectionPayload(
      {
        visual_ok: false,
        connectors_ok: false,
        balance_ok: false,
        test_cycle_ok: false,
        capacity_percent: 60,
        result: 'Не пройдена',
        notes: '',
      },
      'Требуется проверка',
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('комментарий');
  });
});

describe('Battery SQLite triggers', () => {
  let db;
  let dbPath;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `battery-test-${Date.now()}-${Math.random()}.db`);
    db = await openDb(dbPath);
    await setupBatteryTestSchema(db);
    await run(
      db,
      `INSERT INTO batteries (id, serial_number, type, capacity, cycle_count, status)
       VALUES ('b1', 'AKB-TEST-001', 'LiPo', 8500, 49, 'Отлично')`,
    );
  });

  afterEach(async () => {
    await closeDb(db);
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  test('49→50: статус «Требуется проверка»', async () => {
    await completeMission(db, 'b1', 'm1');
    const battery = await get(db, `SELECT cycle_count, status FROM batteries WHERE id = 'b1'`);
    expect(battery.cycle_count).toBe(50);
    expect(battery.status).toBe('Требуется проверка');
  });

  test('после «Пройдена» цикл 50→51 не блокирует АКБ', async () => {
    await completeMission(db, 'b1', 'm1');
    await run(
      db,
      `INSERT INTO battery_inspection_logs (
        battery_id, operator_id, cycle_count_at_inspection,
        visual_ok, connectors_ok, balance_ok, test_cycle_ok,
        capacity_percent, result
      ) VALUES ('b1', 4, 50, 1, 1, 1, 1, 85, 'Пройдена')`,
    );
    await completeMission(db, 'b1', 'm2');
    const battery = await get(db, `SELECT cycle_count, status FROM batteries WHERE id = 'b1'`);
    expect(battery.cycle_count).toBe(51);
    expect(battery.status).toBe('Отлично');
  });

  test('99→100: повторная блокировка на пороге', async () => {
    await run(db, `UPDATE batteries SET cycle_count = 99, status = 'Отлично' WHERE id = 'b1'`);
    await completeMission(db, 'b1', 'm3');
    const battery = await get(db, `SELECT cycle_count, status FROM batteries WHERE id = 'b1'`);
    expect(battery.cycle_count).toBe(100);
    expect(battery.status).toBe('Требуется проверка');
  });

  test('миссия с АКБ «Требуется проверка» отклоняется', async () => {
    await run(
      db,
      `UPDATE batteries SET cycle_count = 50, status = 'Требуется проверка' WHERE id = 'b1'`,
    );

    await expect(
      run(
        db,
        `INSERT INTO missions (id, title, operator_id, drone_id, battery_id, sector_id, start_time, end_time, status)
         VALUES ('mx', 'Blocked', 1, 1, 'b1', 1, '2026-02-01 10:00:00', '2026-02-01 11:00:00', 'Запланировано')`,
      ),
    ).rejects.toThrow(/АКБ недоступна/);
  });
});
