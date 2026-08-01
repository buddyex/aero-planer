const jwt = require('jsonwebtoken');
const config = require('../config');
const { get } = require('../db/pool');
const { verifyPin, createPinCredentials } = require('../lib/pin-auth');
const { logAction } = require('./audit.service');
const systemLogger = require('../lib/system-logger');

const loginAttempts = new Map();
const ipAttempts = new Map();
const MAX_ATTEMPTS = config.limits.loginMaxAttempts;
const LOCKOUT_MS = config.limits.loginLockoutMs;

function checkRateLimitMap(map, key) {
  const entry = map.get(key);
  if (!entry) return { ok: true };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return { ok: false, error: `Слишком много попыток. Повторите через ${minutes} мин.` };
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    map.delete(key);
  }
  return { ok: true };
}

function recordFailedAttempt(map, key) {
  const entry = map.get(key) || { count: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  map.set(key, entry);
}

function checkLoginRateLimit(login, ip) {
  const loginCheck = checkRateLimitMap(loginAttempts, String(login || '').toLowerCase());
  if (!loginCheck.ok) return loginCheck;
  if (ip) {
    const ipCheck = checkRateLimitMap(ipAttempts, ip);
    if (!ipCheck.ok) return ipCheck;
  }
  return { ok: true };
}

function recordFailedLogin(login, ip) {
  recordFailedAttempt(loginAttempts, String(login || '').toLowerCase());
  if (ip) recordFailedAttempt(ipAttempts, ip);
}

function clearLoginAttempts(login, ip) {
  loginAttempts.delete(String(login || '').toLowerCase());
  if (ip) ipAttempts.delete(ip);
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function clearRefreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
  };
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

async function loginOperator(login, pin, clientIp = null) {
  if (!login?.trim() || pin === undefined || pin === null || String(pin).trim() === '') {
    return { ok: false, error: 'Укажите логин и PIN-код.' };
  }

  const rateCheck = checkLoginRateLimit(login, clientIp);
  if (!rateCheck.ok) return rateCheck;

  const operator = await get(
    'SELECT id, full_name, login, role, pin_code, pin_hash, pin_salt FROM operators WHERE login = ?',
    [login.trim()],
  );

  if (!operator) {
    recordFailedLogin(login, clientIp);
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
  } else if (operator.pin_code && !config.isProduction) {
    // Legacy plaintext only in non-production; migrate to scrypt on success.
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
    recordFailedLogin(login, clientIp);
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

  clearLoginAttempts(login, clientIp);
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

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    return { ok: false, error: 'UNAUTHORIZED', message: 'Нет refresh-токена.' };
  }
  try {
    const payload = verifyToken(refreshToken);
    if (payload.type !== 'refresh' || !payload.sub) {
      return { ok: false, error: 'UNAUTHORIZED', message: 'Недействительный токен.' };
    }
    const operator = await get(
      'SELECT id, full_name, login, role FROM operators WHERE id = ?',
      [payload.sub],
    );
    if (!operator) {
      return { ok: false, error: 'UNAUTHORIZED', message: 'Сессия недействительна.' };
    }
    return {
      ok: true,
      data: operator,
      accessToken: signAccessToken(operator),
      refreshToken: signRefreshToken(operator),
    };
  } catch {
    return { ok: false, error: 'UNAUTHORIZED', message: 'Сессия истекла.' };
  }
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
  refreshAccessToken,
  getOperatorById,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  refreshCookieOptions,
  clearRefreshCookieOptions,
};
