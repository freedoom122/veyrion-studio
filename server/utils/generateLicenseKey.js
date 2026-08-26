const crypto = require('crypto');

function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = 5;
  const segmentLength = 5;
  const key = [];

  for (let i = 0; i < segments; i++) {
    const bytes = crypto.randomBytes(segmentLength);
    let segment = '';
    for (let j = 0; j < segmentLength; j++) {
      segment += chars[bytes[j] % chars.length];
    }
    key.push(segment);
  }

  return key.join('-');
}

module.exports = generateLicenseKey;
