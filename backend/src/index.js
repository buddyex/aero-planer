const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const config = require('./config');
const { pool } = require('./db/pool');
const { createApiRouter } = require('./routes/api.routes');
const { initSockets } = require('./sockets/index');
const { errorHandler } = require('./middleware/errorHandler');

async function verifyDatabaseConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    await conn.end();
    console.log(`MySQL connected: ${config.db.user}@${config.db.host}/${config.db.database}`);
  } catch (err) {
    console.error('\n[MySQL] Не удалось подключиться к базе данных.');
    console.error(`  Файл: ${path.join(__dirname, '../.env')}`);
    console.error(`  Пользователь: ${config.db.user}, пароль: ${config.db.password ? '***' : '(пусто)'}`);
    console.error(`  Ошибка: ${err.message}`);
    console.error('  Укажите DB_USER=root и DB_PASSWORD=ваш_пароль_mysql в backend/.env\n');
    process.exit(1);
  }
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    credentials: true,
  },
});

initSockets(io);

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use('/api', createApiRouter(io));
app.use(errorHandler);

verifyDatabaseConnection().then(() => {
  server.listen(config.port, () => {
    console.log(`Aero-Planer API listening on port ${config.port}`);
  });
});

module.exports = { app, server, io };