/**
 * Миграция данных из legacy SQLite (database/database.db) в MySQL.
 * Usage: node scripts/migrate-sqlite-to-mysql.js --sqlite=../database/database.db
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const sqlite3 = require('sqlite3').verbose();
const { pool } = require('../src/db/pool');

function openSqlite(path) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path, (err) => (err ? reject(err) : resolve(db)));
  });
}

function allSqlite(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function migrateTable(conn, table, rows, mapper) {
  let count = 0;
  for (const row of rows) {
    const mapped = mapper(row);
    if (!mapped) continue;
    const cols = Object.keys(mapped);
    const placeholders = cols.map(() => '?').join(',');
    await conn.execute(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c}=VALUES(${c})`).join(',')}`,
      cols.map((c) => mapped[c]),
    );
    count += 1;
  }
  return count;
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--sqlite='));
  const sqlitePath = arg ? arg.split('=')[1] : '../database/database.db';

  const db = await openSqlite(sqlitePath);
  const conn = await pool.getConnection();

  try {
    const operators = await allSqlite(db, 'SELECT * FROM operators');
    const drones = await allSqlite(db, 'SELECT * FROM drones');
    const batteries = await allSqlite(db, 'SELECT * FROM batteries');
    const sectors = await allSqlite(db, 'SELECT * FROM sectors');
    const missions = await allSqlite(db, 'SELECT * FROM missions');

    console.log('operators:', await migrateTable(conn, 'operators', operators, (r) => ({
      id: r.id,
      full_name: r.full_name,
      login: r.login,
      pin_code: '',
      pin_hash: r.pin_hash,
      pin_salt: r.pin_salt,
      role: r.role,
      duty_status: r.duty_status ?? 'Свободен',
    })));

    console.log('drones:', await migrateTable(conn, 'drones', drones, (r) => ({ ...r })));
    console.log('batteries:', await migrateTable(conn, 'batteries', batteries, (r) => ({ ...r })));
    console.log('sectors:', await migrateTable(conn, 'sectors', sectors, (r) => ({ ...r })));
    console.log('missions:', await migrateTable(conn, 'missions', missions, (r) => ({
      id: r.id,
      title: r.title,
      operator_id: r.operator_id,
      drone_id: r.drone_id,
      battery_id: r.battery_id,
      sector_id: r.sector_id,
      start_time: r.start_time,
      end_time: r.end_time,
      creator_id: r.creator_id ? parseInt(r.creator_id, 10) : null,
      approved_by_id: r.approved_by_id ? parseInt(r.approved_by_id, 10) : null,
      route_geometry: r.route_geometry,
      status: r.status,
      flight_radius_m: r.flight_radius_m,
      flight_altitude_m: r.flight_altitude_m,
      sync_status: r.sync_status ?? 0,
    })));

    console.log('Migration completed.');
  } finally {
    conn.release();
    await pool.end();
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
