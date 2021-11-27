const jose = require('node-jose');
const svgCaptcha = require('svg-captcha');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'defaultSecret';
const JWT_SIGN_EXPIRY = process.env.JWT_SIGN_EXPIRY || '30'; // In minutes
const CAPTCHA_SIGN_EXPIRY = (process.env.CAPTCHA_SIGN_EXPIRY && +process.env.CAPTCHA_SIGN_EXPIRY) || 30; // In minutes
const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? JSON.parse(process.env.PRIVATE_KEY)
  : {
      kty: 'oct',
      kid: 'gBdaS-G8RLax2qObTD94w',
      use: 'enc',
      alg: 'A256GCM',
      k: 'FK3d8WvSRdxlUHs4Fs_xxYO3-6dCiUarBwiYNFw5hv8'
    };

async function getCaptcha(payload) {
  const captcha = svgCaptcha.create({
    size: 6, // size of random string
    ignoreChars: '0o1il', // filter out some characters like 0o1i
    noise: 2 // number of lines to insert for noise
  });

  if (!captcha || (captcha && !captcha.data)) {
    // Something bad happened with Captcha.
    return {
      valid: false
    };
  }

  // add answer, nonce and expiry to body
  const body = {
    nonce: payload?.nonce,
    answer: captcha.text,
    expiry: Date.now() + CAPTCHA_SIGN_EXPIRY * 60000
  };
  try {
    const validation = await encrypt(body);
    if (validation === '') {
      return {
        valid: false
      };
    } else {
      // create basic response
      const responseBody = {
        nonce: payload?.nonce,
        captcha: captcha.data,
        validation: validation
      };
      return responseBody;
    }
  } catch (err) {
    console.error(err);
    return {
      valid: false
    };
  }
}

async function verifyCaptcha(payload) {
  const validation = payload.validation;
  const answer = payload.answer;
  const nonce = payload.nonce;

  const token = jwt.sign(
    {
      data: {
        nonce: nonce
      }
    },
    SECRET,
    {
      expiresIn: JWT_SIGN_EXPIRY + 'm'
    }
  );

  // Normal mode, decrypt token
  const body = await decrypt(validation, PRIVATE_KEY);
  if (body?.answer.toLowerCase() === answer.toLowerCase() && body?.nonce === nonce && body?.expiry > Date.now()) {
    return {
      valid: true,
      jwt: token
    };
  } else {
    // Bad decyption
    return {
      valid: false
    };
  }
}

async function verifyJWT(token, nonce) {
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.data && decoded.data.nonce === nonce) {
      return {
        valid: true
      };
    } else {
      return {
        valid: false
      };
    }
  } catch (e) {
    console.error(e);
    return {
      valid: false
    };
  }
}

async function encrypt(body) {
  const buff = Buffer.from(JSON.stringify(body));
  try {
    const cr = await jose.JWE.createEncrypt(PRIVATE_KEY).update(buff).final();
    return cr;
  } catch (e) {
    console.error(e);
    throw e;
  }
}

async function decrypt(body, private_key) {
  try {
    const res = await jose.JWK.asKey(private_key, 'json');
    const decrypted = await jose.JWE.createDecrypt(res).decrypt(body);
    const decryptedObject = JSON.parse(decrypted.plaintext.toString('utf8'));
    return decryptedObject;
  } catch (e) {
    console.error(e);
    throw e;
  }
}

module.exports = {
  getCaptcha,
  verifyCaptcha,
  verifyJWT
};
