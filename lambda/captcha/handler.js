const { getCaptcha } = require('bcparks-captcha');
const { sendResponse } = require('../responseUtil');

async function generateCaptcha(event) {
  const captcha = await getCaptcha(event.body);
}

module.exports = {
  generateCaptcha
};
