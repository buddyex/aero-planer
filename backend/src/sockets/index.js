const authService = require('../services/auth.service');
const { get } = require('../db/pool');

function initSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = authService.verifyToken(token);
      if (payload.type === 'refresh') return next(new Error('UNAUTHORIZED'));

      const operator = await get(
        'SELECT id, role FROM operators WHERE id = ?',
        [payload.sub],
      );
      if (!operator) return next(new Error('UNAUTHORIZED'));

      socket.operatorId = operator.id;
      socket.role = operator.role;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.operatorId}`);
    socket.join(`role:${socket.role}`);

    socket.on('chat:typing', (payload) => {
      if (payload?.receiverId) {
        io.to(`user:${payload.receiverId}`).emit('chat:typing', {
          senderId: socket.operatorId,
        });
      }
    });
  });
}

module.exports = { initSockets };
