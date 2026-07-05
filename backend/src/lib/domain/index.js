/**
 * Domain helpers — чистая бизнес-логика без привязки к Electron.
 * Domain helpers — чистая бизнес-логика без привязки к UI.
 */
const rbac = require('../rbac');
const pinAuth = require('../pin-auth');

function validateDroneStatusOnCreate(requestedStatus) {
  return requestedStatus == null || requestedStatus === 'Готов';
}

module.exports = {
  rbac,
  pinAuth,
  validateDroneStatusOnCreate,
};
