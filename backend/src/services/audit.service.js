const { v4: uuidv4 } = require('uuid');
const { get, run } = require('../db/pool');

async function logAction(operatorId, actionText) {
  await run(
    `INSERT INTO audit_logs (id, operator_id, action_text, timestamp, sync_status)
     VALUES (?, ?, ?, NOW(), 1)`,
    [uuidv4(), operatorId ?? null, actionText],
  );
}

module.exports = { logAction };
