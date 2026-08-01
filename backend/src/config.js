const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_JWT_SECRET = 'dev-secret-change-in-production';
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

if (isProduction && (!process.env.JWT_SECRET || jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.length < 32)) {
  console.error(
    '[FATAL] В production задайте сильный JWT_SECRET (минимум 32 символа) в backend/.env. Дефолтный секрет запрещён.',
  );
  process.exit(1);
}

if (!isProduction && jwtSecret === DEFAULT_JWT_SECRET) {
  console.warn('[security] JWT_SECRET не задан — используется dev-секрет. Не деплойте так в production.');
}

module.exports = {
  port: parseInt(process.env.PORT || '5000', 10),
  isProduction,
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
    secret: jwtSecret,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
    refreshCookie: 'aero_planer_refresh',
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  checkWxApiKey: process.env.CHECKWX_API_KEY || '',
  limits: {
    messageMaxLength: 4000,
    auditLogMaxLimit: 200,
    errorReportMaxLength: 4000,
    loginMaxAttempts: 5,
    loginLockoutMs: 15 * 60 * 1000,
  },
};
