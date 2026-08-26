const db = require('../config/database');
const generateLicenseKey = require('../utils/generateLicenseKey');

const License = {
  findById(id) {
    return db.prepare(`
      SELECT l.*, p.name as product_name, p.slug as product_slug, u.name as user_name, u.email as user_email
      FROM licenses l
      LEFT JOIN products p ON l.product_id = p.id
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.id = ?
    `).get(id);
  },

  findByKey(licenseKey) {
    return db.prepare(`
      SELECT l.*, p.name as product_name
      FROM licenses l
      LEFT JOIN products p ON l.product_id = p.id
      WHERE l.license_key = ?
    `).get(licenseKey);
  },

  create({ product_id, order_id, user_id, activations_limit = 3, expires_at }) {
    const licenseKey = generateLicenseKey();
    const result = db.prepare(`
      INSERT INTO licenses (license_key, product_id, order_id, user_id, activations_limit, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(licenseKey, product_id, order_id, user_id, activations_limit, expires_at || null);
    return this.findById(result.lastInsertRowid);
  },

  incrementActivation(id) {
    db.prepare("UPDATE licenses SET activations_count = activations_count + 1, last_used_at = datetime('now') WHERE id = ?").run(id);
    return this.findById(id);
  },

  revoke(id) {
    db.prepare("UPDATE licenses SET status = 'revoked' WHERE id = ?").run(id);
    return this.findById(id);
  },

  list({ page = 1, limit = 20, status = '', search = '', user_id = null }) {
    let where = 'WHERE 1=1';
    const params = [];

    if (user_id) {
      where += ' AND l.user_id = ?';
      params.push(user_id);
    }
    if (status) {
      where += ' AND l.status = ?';
      params.push(status);
    }
    if (search) {
      where += ' AND (l.license_key LIKE ? OR p.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM licenses l
      LEFT JOIN products p ON l.product_id = p.id
      LEFT JOIN users u ON l.user_id = u.id
      ${where}
    `).get(...params).count;

    const licenses = db.prepare(`
      SELECT l.*, p.name as product_name, p.slug as product_slug, u.name as user_name, u.email as user_email
      FROM licenses l
      LEFT JOIN products p ON l.product_id = p.id
      LEFT JOIN users u ON l.user_id = u.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit);

    return { licenses, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  count() {
    return db.prepare('SELECT COUNT(*) as count FROM licenses').get().count;
  },
};

module.exports = License;
