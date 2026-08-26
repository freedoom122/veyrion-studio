const crypto = require('crypto');
const db = require('../config/database');

function generateOrderNumber() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();

  return `VY-${year}${month}-${random}`;
}

function generateDownloadToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { generateOrderNumber, generateDownloadToken };
