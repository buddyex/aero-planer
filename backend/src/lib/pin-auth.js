const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), String(salt), SCRYPT_KEYLEN).toString('hex');
}

function verifyPin(pin, storedHash, salt) {
  if (!storedHash || !salt) return false;
  const computed = hashPin(pin, salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}

function createPinCredentials(pin) {
  const salt = generateSalt();
  return { pin_salt: salt, pin_hash: hashPin(pin, salt) };
}

module.exports = { generateSalt, hashPin, verifyPin, createPinCredentials };
