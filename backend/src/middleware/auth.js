const authService = require('../services/auth.service');
const rbac = require('../lib/rbac');
const { get } = require('../db/pool');

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Требуется авторизация.' });
    }
    const payload = authService.verifyToken(token);
    if (payload.type === 'refresh') {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Недействительный токен.' });
    }
    const operator = await get(
      'SELECT id, full_name, login, role FROM operators WHERE id = ?',
      [payload.sub],
    );
    if (!operator) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Сессия недействительна.' });
    }
    req.user = operator;
    req.operatorId = operator.id;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Сессия истекла.' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        message: `Доступ запрещён: требуется роль ${allowedRoles.join(' или ')}.`,
      });
    }
    next();
  };
}

function requirePermission(permissionKey) {
  const allowed = rbac.PERMISSIONS[permissionKey] || [];
  return requireRole(...allowed);
}

module.exports = { requireAuth, requireRole, requirePermission, extractToken };
