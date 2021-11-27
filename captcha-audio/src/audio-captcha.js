const jose = require('node-jose');
const lame = require('@suldashi/lame');
const wav = require('wav');
const text2wav = require('text2wav');
const streamifier = require('streamifier');
const arrayBufferToBuffer = require('arraybuffer-to-buffer');

const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? JSON.parse(process.env.PRIVATE_KEY)
  : {
      kty: 'oct',
      kid: 'gBdaS-G8RLax2qObTD94w',
      use: 'enc',
      alg: 'A256GCM',
      k: 'FK3d8WvSRdxlUHs4Fs_xxYO3-6dCiUarBwiYNFw5hv8'
    };
const AUDIO_ENABLED = process.env.AUDIO_ENABLED || 'true';

const voicePromptLanguageMap = {
  en: 'Please type in following letters or numbers', // english
  fr: 'Veuillez saisir les lettres ou les chiffres suivants', // french
  pa: 'ਕਿਰਪਾ ਕਰਕੇ ਹੇਠ ਲਿਖੇ ਅੱਖਰ ਜਾਂ ਨੰਬਰ ਟਾਈਪ ਕਰੋ', // punjabi
  zh: '请输入以下英文字母或数字' // mandarin chinese
};

async function getAudio(body, translation) {
  try {
    // Ensure audio is enabled.
    if (!AUDIO_ENABLED || AUDIO_ENABLED !== 'true') {
      winston.error('audio disabled but user attempted to getAudio');
      return {
        error: 'audio disabled'
      };
    }

    // pull out encrypted answer
    const validation = body.validation;

    console.log("========================validation====================");
    console.log(validation);
    console.log("========================validation====================");

    // decrypt payload to get captcha text
    let decryptedBody = await decrypt(validation, PRIVATE_KEY);

    // Insert leading text and commas to slow down reader
    const captchaCharArray = decryptedBody.answer.toString().split('');
    let language = 'en';
    if (translation) {
      if (voicePromptLanguageMap.hasOwnProperty(translation)) {
        language = translation;
      }
    }
    let spokenCatpcha = voicePromptLanguageMap[language] + ': ';
    for (let i = 0; i < captchaCharArray.length; i++) {
      spokenCatpcha += captchaCharArray[i] + ', ';
    }
    const audioDataUri = await getMp3DataUriFromText(spokenCatpcha, language);
    console.log(audioDataUri);
    // Now pass back the full payload
    return {
      audio: audioDataUri
    };
  } catch (e) {
    console.error(e);
    return {
      error: 'unknown'
    };
  }
}

function getMp3DataUriFromText(text, language = 'en') {
  return new Promise(async function (resolve) {
    // init wave reader, used to convert WAV to PCM
    var reader = new wav.Reader();

    // we have to wait for the "format" event before we can start encoding
    reader.on('format', function (format) {
      // init encoder
      var encoder = new lame.Encoder(format);

      // Pipe Wav reader to the encoder and capture the output stream

      // As the stream is encoded, convert the mp3 array buffer chunks into base64 string with mime type
      var dataUri = 'data:audio/mp3;base64,';
      encoder.on('data', function (arrayBuffer) {
        if (!dataUri) {
          return;
        }
        dataUri += arrayBuffer.toString('base64');
        // by observation encoder hung before finish due to event loop being empty
        // setTimeout injects an event to mitigate the issue
        setTimeout(() => {}, 0);
      });

      // When encoding is complete, callback with data uri
      encoder.on('finish', function () {
        resolve(dataUri);
        dataUri = undefined;
      });
      reader.pipe(encoder);
    });

    // Generate audio, Base64 encoded WAV in DataUri format including mime type header
    let audioArrayBuffer = await text2wav(text, { voice: language });

    // convert to buffer
    var audioBuffer = arrayBufferToBuffer(audioArrayBuffer);

    // Convert ArrayBuffer to Streamable type for input to the encoder
    var audioStream = streamifier.createReadStream(audioBuffer);

    // once all events setup we can the pipeline
    audioStream.pipe(reader);
  });
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
  getAudio
};
