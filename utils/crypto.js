const crypto = require('crypto');

function encrypt(plaintext, key) {
    const iv = crypto.randomBytes(16);
    const ivHex = iv.toString('hex');

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = cipher.update(plaintext, 'utf8', 'hex');

    const finalPart = cipher.final('hex');
    const fullEncrypted = encrypted + finalPart;

    return { encrypted: fullEncrypted, iv: ivHex };
}

function decrypt(encryptedHex, ivHex, key) {
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };