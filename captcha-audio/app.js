const { getAudio } = require('./src/audio-captcha');

exports.handler = async event => {
  console.log(event);

  const data = JSON.parse(event.body);
  const res = await getAudio(data);

  return sendResponse(200, res);
};

function sendResponse(code, data) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,GET'
    },
    body: JSON.stringify(data)
  };
  return response;
}
