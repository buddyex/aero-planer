const config = require('../config');

function getCheckWxApiKey() {
  return process.env.CHECKWX_API_KEY || config.checkWxApiKey || '';
}

module.exports = { getCheckWxApiKey };
