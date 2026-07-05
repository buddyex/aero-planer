const jwt = require('jsonwebtoken');
const config = require('../config');
const { get } = require('../db/pool');
const { verifyPin, createPinCredentials } = require('../lib/pin-auth');
const { logAction } = require('./audit.service');
const systemLogger = require('../lib/system-logger');

const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function checkLoginRateLimit(login) {
  const entry = loginAttempts.get(login);
  if (!entry) return { ok: true };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return { ok: false, error: `Слишком много попыток. Повторите через ${minutes} мин.` };
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    loginAttempts.delete(login);
  }
  return { ok: true };
}

function recordFailedLogin(login) {
  const entry = loginAttempts.get(login) || { count: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(login, entry);
}

function clearLoginAttempts(login) {
  loginAttempts.delete(login);
}

function signAccessToken(operator) {
  return jwt.sign(
    { sub: operator.id, role: operator.role, login: operator.login },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpires },
  );
}

function signRefreshToken(operator) {
  return jwt.sign(
    { sub: operator.id, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpires },
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

async function loginOperator(login, pin) {
  const rateCheck = checkLoginRateLimit(login);
  if (!rateCheck.ok) return rateCheck;

  const operator = await get(
    'SELECT id, full_name, login, role, pin_code, pin_hash, pin_salt FROM operators WHERE login = ?',
    [login.trim()],
  );

  if (!operator) {
    recordFailedLogin(login);
    systemLogger.logSystemError({
      subsystem: 'auth',
      location: 'loginOperator',
      error: new Error('Invalid login'),
      phase: 'runtime',
      severity: 'warning',
      context: { login: login.trim(), reason: 'unknown_user' },
    });
    return { ok: false, error: 'Неверный логин или PIN-код.' };
  }

  let valid = false;
  if (operator.pin_hash && operator.pin_salt) {
    valid = verifyPin(pin, operator.pin_hash, operator.pin_salt);
  } else if (operator.pin_code) {
    valid = String(operator.pin_code) === String(pin);
    if (valid) {
      const creds = createPinCredentials(pin);
      const { run } = require('../db/pool');
      await run(
        'UPDATE operators SET pin_hash = ?, pin_salt = ?, pin_code = ? WHERE id = ?',
        [creds.pin_hash, creds.pin_salt, '', operator.id],
      );
    }
  }

  if (!valid) {
    recordFailedLogin(login);
    systemLogger.logSystemError({
      subsystem: 'auth',
      location: 'loginOperator',
      error: new Error('Invalid PIN'),
      phase: 'runtime',
      severity: 'warning',
      context: { login: login.trim(), operatorId: operator.id, reason: 'invalid_pin' },
    });
    return { ok: false, error: 'Неверный логин или PIN-код.' };
  }

  clearLoginAttempts(login);
  await logAction(operator.id, `Вход в систему: ${operator.full_name} (${operator.role})`);

  const user = {
    id: operator.id,
    full_name: operator.full_name,
    login: operator.login,
    role: operator.role,
  };

  return {
    ok: true,
    data: user,
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

async function getOperatorById(id) {
  return get(
    'SELECT id, full_name, login, role, duty_status FROM operators WHERE id = ?',
    [id],
  );
}

async function logoutOperator(operatorId) {
  const op = await getOperatorById(operatorId);
  if (op) {
    await logAction(operatorId, `Завершение смены: ${op.full_name}`);
  }
  return { ok: true };
}

module.exports = {
  loginOperator,
  logoutOperator,
  getOperatorById,
  signAccessToken,
  signRefreshToken,
  verifyToken,
};
