'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

function getKeyFromPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
}

/**
 * Encrypt plaintext with AES-256-GCM. Returns base64(salt|iv|tag|ciphertext).
 * @param {string} text
 * @param {string} password
 * @returns {string}
 */
function encrypt(text, password) {
  if (!text || !password) {
    throw new Error('Texto e senha são obrigatórios para criptografia');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKeyFromPassword(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([
    salt,
    iv,
    tag,
    Buffer.from(encrypted, 'base64'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt AES-256-GCM payload produced by encrypt().
 * @param {string} encryptedText
 * @param {string} password
 * @returns {string}
 */
function decrypt(encryptedText, password) {
  if (!encryptedText || !password) {
    throw new Error('Texto criptografado e senha são obrigatórios para descriptografia');
  }

  try {
    const combined = Buffer.from(encryptedText, 'base64');
    if (combined.length < ENCRYPTED_POSITION) {
      throw new Error('Texto criptografado inválido');
    }

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, TAG_POSITION);
    const tag = combined.slice(TAG_POSITION, ENCRYPTED_POSITION);
    const encrypted = combined.slice(ENCRYPTED_POSITION);

    const key = getKeyFromPassword(password, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    throw new Error(`Erro ao descriptografar: ${error.message}`);
  }
}

module.exports = { encrypt, decrypt };
