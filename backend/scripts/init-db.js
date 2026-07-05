/**
 * Применяет schema.sql к MySQL (удобно на Windows, где `< schema.sql` в PowerShell не работает).
 * Usage: node scripts/init-db.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

function prepareSchemaSql(raw) {
  return raw
    .replace(/^\s*DELIMITER\s+\$\$\s*$/gm, '')
    .replace(/^\s*DELIMITER\s+;\s*$/gm, '')
    .replace(/END\$\$/g, 'END;');
}

async function initDb() {
  const schemaPath = path.join(__dirname, '../../schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('schema.sql not found at', schemaPath);
    process.exit(1);
  }

  const prepared = prepareSchemaSql(fs.readFileSync(schemaPath, 'utf8'));
  const triggerStart = prepared.search(/CREATE TRIGGER/i);
  const ddl = triggerStart >= 0 ? prepared.slice(0, triggerStart).trim() : prepared;
  const triggerSection = triggerStart >= 0 ? prepared.slice(triggerStart).trim() : '';
  const triggers = triggerSection
    ? triggerSection.split(/(?=CREATE TRIGGER )/i).map((s) => s.trim()).filter(Boolean)
    : [];

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  try {
    console.log(`Applying schema to ${config.db.host}/${config.db.database} as ${config.db.user}...`);
    if (ddl) {
      await conn.query(ddl);
    }
    for (const triggerSql of triggers) {
      await conn.query(triggerSql);
    }
    const [tables] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ?',
      [config.db.database],
    );
    console.log(`Schema applied. Tables in ${config.db.database}: ${tables[0].cnt}`);
  } finally {
    await conn.end();
  }
}

initDb().catch((err) => {
  console.error('init-db failed:', err.message);
  process.exit(1);
});
