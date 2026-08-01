const authService = require('../services/auth.service');
const { get } = require('../db/pool');

/**
 * Protect /uploads for <img> (query token) and authenticated API clients (Bearer).
 */
async function requireUploadsAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    let token = null;
    if (header?.startsWith('Bearer ')) {
      token = header.slice(7);
    } else if (typeof req.query.access_token === 'string' && req.query.access_token) {
      token = req.query.access_token;
    }

    if (!token) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Требуется авторизация.' });
    }

    const payload = authService.verifyToken(token);
    if (payload.type === 'refresh') {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Недействительный токен.' });
    }

    const operator = await get('SELECT id FROM operators WHERE id = ?', [payload.sub]);
    if (!operator) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Сессия недействительна.' });
    }

    return next();
  } catch {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Сессия истекла.' });
  }
}

module.exports = { requireUploadsAuth };
