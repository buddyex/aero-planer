const authService = require('../services/auth.service');

function initSockets(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = authService.verifyToken(token);
      if (payload.type === 'refresh') return next(new Error('UNAUTHORIZED'));
      socket.operatorId = payload.sub;
      socket.role = payload.role;
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
