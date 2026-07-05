const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

module.exports = {
  port: parseInt(process.env.PORT || '3001', 10),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'aero_planer',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aero_planer',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
    refreshCookie: 'aero_planer_refresh',
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  checkWxApiKey: process.env.CHECKWX_API_KEY || '',
};
