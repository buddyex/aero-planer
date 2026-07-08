/**
 * Применяет SQL-миграцию к MySQL (кроссплатформенно; в PowerShell `< file.sql` не работает).
 * Usage: node scripts/run-migration.js [имя_файла.sql]
 * Example: node scripts/run-migration.js 002_wear_logic_fix.sql
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

function prepareSql(raw) {
  return raw
    .replace(/^\s*DELIMITER\s+\$\$\s*$/gm, '')
    .replace(/^\s*DELIMITER\s+;\s*$/gm, '')
    .replace(/END\$\$/g, 'END;')
    .replace(/\$\$/g, ';');
}

function splitStatements(prepared) {
  const triggerStart = prepared.search(/CREATE TRIGGER|DROP TRIGGER/i);
  if (triggerStart < 0) {
    return prepared
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const prefix = prepared.slice(0, triggerStart).trim();
  const triggerSection = prepared.slice(triggerStart).trim();
  const prefixStmts = prefix
    ? prefix
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const triggers = triggerSection
    ? triggerSection.split(/(?=(?:CREATE|DROP) TRIGGER )/i).map((s) => s.trim()).filter(Boolean)
    : [];

  return [...prefixStmts, ...triggers];
}

async function runMigration() {
  const fileName = process.argv[2] || '002_wear_logic_fix.sql';
  const migrationPath = path.join(__dirname, '../migrations', fileName);

  if (!fs.existsSync(migrationPath)) {
    console.error('Migration not found:', migrationPath);
    process.exit(1);
  }

  const prepared = prepareSql(fs.readFileSync(migrationPath, 'utf8'));
  const statements = splitStatements(prepared);

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
  });

  try {
    console.log(`Applying ${fileName} to ${config.db.host}/${config.db.database} as ${config.db.user}...`);
    for (const sql of statements) {
      await conn.query(sql);
    }
    console.log(`Migration ${fileName} applied successfully.`);
  } finally {
    await conn.end();
  }
}

runMigration().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
