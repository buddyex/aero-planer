/** @type {import('socket.io').Server | null} */
let ioInstance = null;

function userRoom(userId) {
  return `user:${userId}`;
}

function roleRoom(roleName) {
  return `role:${roleName}`;
}

function initEmitter(io) {
  ioInstance = io;
}

function emitToUser(userId, event, payload) {
  if (!ioInstance) return;
  ioInstance.to(userRoom(userId)).emit(event, payload);
}

function emitToRoles(roles, event, payload) {
  if (!ioInstance) return;
  for (const role of roles) {
    ioInstance.to(roleRoom(role)).emit(event, payload);
  }
}

function emitBroadcast(event, payload) {
  if (!ioInstance) return;
  ioInstance.emit(event, payload);
}

module.exports = {
  initEmitter,
  userRoom,
  roleRoom,
  emitToUser,
  emitToRoles,
  emitBroadcast,
};
