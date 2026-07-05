const axios = require('axios');

async function weatherHttpGet(url, options = {}) {
  const response = await axios.get(url, {
    timeout: options.timeout ?? 15000,
    headers: options.headers ?? {},
    validateStatus: (status) => status >= 200 && status < 300,
  });
  return response.data;
}

module.exports = { weatherHttpGet };
