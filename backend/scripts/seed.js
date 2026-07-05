require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { pool } = require('../src/db/pool');
const { createPinCredentials } = require('../src/lib/pin-auth');

const operators = [
  { id: 1, full_name: 'Иванов А.С.', login: 'admin', pin: '1234', role: 'Администратор' },
  { id: 2, full_name: 'Петров К.В.', login: 'operator1', pin: '1111', role: 'Оператор' },
  { id: 3, full_name: 'Сидорова М.Л.', login: 'operator2', pin: '2222', role: 'Оператор' },
  { id: 4, full_name: 'Козлов Д.И.', login: 'tech1', pin: '3333', role: 'Техник' },
  { id: 5, full_name: 'Николаев Р.П.', login: 'head1', pin: '4444', role: 'Руководитель' },
];

const drones = [
  [1, 'Orlan-10', 'ORL-001', 12.0, 10000, 5.0, 120, 'Готов'],
  [2, 'Orlan-10', 'ORL-002', 12.0, 10000, 5.0, 120, 'Готов'],
  [3, 'Zala 421-16E2', 'ZLA-014', 10.0, 8500, 3.5, 90, 'Готов'],
  [4, 'Zala 421-16E2', 'ZLA-021', 10.0, 8500, 3.5, 90, 'Готов'],
  [5, 'Orlan-10', 'ORL-007', 12.0, 10000, 5.0, 120, 'Готов'],
];

const batteries = [
  ['b0000001-0000-4000-8000-000000000001', 'AKB-ORL-001', 'LiPo', 10000, 0, 'Отлично'],
  ['b0000002-0000-4000-8000-000000000002', 'AKB-ORL-002', 'LiPo', 10000, 12, 'Отлично'],
  ['b0000003-0000-4000-8000-000000000003', 'AKB-ORL-003', 'LiPo', 10000, 48, 'Отлично'],
  ['b0000004-0000-4000-8000-000000000004', 'AKB-ZLA-001', 'LiPo', 8500, 5, 'Отлично'],
  ['b0000005-0000-4000-8000-000000000005', 'AKB-ZLA-002', 'LiPo', 8500, 50, 'Требуется проверка'],
  ['b0000006-0000-4000-8000-000000000006', 'AKB-ORL-004', 'LiPo', 10000, 22, 'Отлично'],
];

async function seed() {
  const conn = await pool.getConnection();
  try {
    for (const op of operators) {
      const creds = createPinCredentials(op.pin);
      await conn.query(
        `INSERT INTO operators (id, full_name, login, pin_code, pin_hash, pin_salt, role)
         VALUES (?, ?, ?, '', ?, ?, ?)
         ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), pin_hash=VALUES(pin_hash), pin_salt=VALUES(pin_salt)`,
        [op.id, op.full_name, op.login, creds.pin_hash, creds.pin_salt, op.role],
      );
    }

    for (const [id, name, sn, wind, cap, payload, time, status] of drones) {
      await conn.query(
        `INSERT INTO drones (id, name, serial_number, max_wind_speed, battery_capacity, payload_capacity, flight_time_max, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name)`,
        [id, name, sn, wind, cap, payload, time, status],
      );
    }

    for (const [id, sn, type, cap, cycles, status] of batteries) {
      await conn.query(
        `INSERT INTO batteries (id, serial_number, type, capacity, cycle_count, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE serial_number=VALUES(serial_number)`,
        [id, sn, type, cap, cycles, status],
      );
    }

    console.log('Seed completed.');
  } finally {
    await conn.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
