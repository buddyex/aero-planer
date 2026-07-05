const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../db/pool');
const rbac = require('../lib/rbac');

async function getUsersForChat(sessionOperatorId, sessionRole, searchQuery) {
  if (!rbac.PERMISSIONS.messagesRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  let sql = `SELECT id, full_name, login, role FROM operators WHERE id != ?`;
  const params = [sessionOperatorId];
  if (searchQuery?.trim()) {
    sql += ' AND (full_name LIKE ? OR login LIKE ?)';
    const q = `%${searchQuery.trim()}%`;
    params.push(q, q);
  }
  sql += ' ORDER BY full_name';
  const rows = await all(sql, params);
  return { ok: true, data: rows };
}

async function sendMessage(sessionOperatorId, sessionRole, senderId, receiverId, text) {
  if (!rbac.PERMISSIONS.messagesWrite.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  if (senderId !== sessionOperatorId) {
    return { ok: false, error: 'Нельзя отправлять сообщения от имени другого пользователя.' };
  }
  const trimmed = String(text).trim();
  if (!trimmed) return { ok: false, error: 'Текст сообщения пуст.' };

  const id = uuidv4();
  await run(
    `INSERT INTO messages (id, sender_id, receiver_id, text, timestamp, sync_status, is_read)
     VALUES (?, ?, ?, ?, NOW(), 1, 0)`,
    [id, senderId, receiverId, trimmed],
  );

  const message = await get(
    `SELECT m.*, s.full_name AS sender_name, r.full_name AS receiver_name
     FROM messages m
     INNER JOIN operators s ON s.id = m.sender_id
     INNER JOIN operators r ON r.id = m.receiver_id
     WHERE m.id = ?`,
    [id],
  );

  return { ok: true, data: message };
}

async function getDialogMessages(sessionOperatorId, sessionRole, user1Id, user2Id) {
  if (!rbac.PERMISSIONS.messagesRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  if (sessionOperatorId !== user1Id && sessionOperatorId !== user2Id) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  const rows = await all(
    `SELECT m.*, s.full_name AS sender_name
     FROM messages m
     INNER JOIN operators s ON s.id = m.sender_id
     WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
     ORDER BY m.timestamp ASC`,
    [user1Id, user2Id, user2Id, user1Id],
  );
  return { ok: true, data: rows };
}

async function getUnreadMessages(sessionOperatorId, sessionRole) {
  if (!rbac.PERMISSIONS.messagesRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  const rows = await all(
    `SELECT m.*, s.full_name AS sender_name
     FROM messages m
     INNER JOIN operators s ON s.id = m.sender_id
     WHERE m.receiver_id = ? AND m.is_read = 0
     ORDER BY m.timestamp DESC`,
    [sessionOperatorId],
  );
  return { ok: true, data: rows };
}

async function markDialogAsRead(sessionOperatorId, sessionRole, peerId) {
  if (!rbac.PERMISSIONS.messagesRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  await run(
    'UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND is_read = 0',
    [sessionOperatorId, peerId],
  );
  return { ok: true };
}

module.exports = {
  getUsersForChat,
  sendMessage,
  getDialogMessages,
  getUnreadMessages,
  markDialogAsRead,
};
