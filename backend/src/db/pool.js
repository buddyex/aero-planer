const mysql = require('mysql2/promise');
const config = require('../config');

function createConnectionConfig() {
  return {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: config.db.charset || 'utf8mb4',
    connectTimeout: 10000,
  };
}

async function withConnection(fn) {
  const conn = await mysql.createConnection(createConnectionConfig());
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

async function query(sql, params = []) {
  return withConnection(async (conn) => {
    const [rows] = await conn.query(sql, params);
    return rows;
  });
}

async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

async function all(sql, params = []) {
  return query(sql, params);
}

async function run(sql, params = []) {
  return withConnection(async (conn) => {
    const [result] = await conn.query(sql, params);
    return result;
  });
}

async function withTransaction(fn) {
  const conn = await mysql.createConnection(createConnectionConfig());
  try {
    await conn.beginTransaction();
    const tx = {
      query: async (sql, params) => {
        const [rows] = await conn.query(sql, params);
        return rows;
      },
      get: async (sql, params) => {
        const rows = await tx.query(sql, params);
        return rows[0] ?? null;
      },
      run: async (sql, params) => {
        const [result] = await conn.query(sql, params);
        return result;
      },
    };
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

const pool = {
  async getConnection() {
    return mysql.createConnection(createConnectionConfig());
  },
  async end() {},
};

module.exports = { pool, query, get, all, run, withTransaction };
