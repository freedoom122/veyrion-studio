
const { getDb } = require('../config/database');
const bcrypt = require('bcryptjs');

function migrateSecureAdmin() {
  const db = getDb();
  const columns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  if (!columns.includes('must_change_password')) {
    db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  }
  db.exec(
    "CREATE TABLE IF NOT EXISTS admin_sessions (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, " +
    "token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, " +
    "last_seen_at TEXT NOT NULL DEFAULT (datetime('now')), ip_address TEXT, user_agent TEXT, " +
    "created_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS admin_password_resets (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, " +
    "token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, " +
    "created_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  db.exec('CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_admin_resets_user ON admin_password_resets(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_admin_resets_expiry ON admin_password_resets(expires_at)');

  const ownerEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const bootstrapPassword = String(process.env.ADMIN_PASSWORD || '');
  if (ownerEmail && bootstrapPassword) {
    const owner = db.prepare("SELECT id FROM users WHERE lower(email) = ? LIMIT 1").get(ownerEmail);
    if (!owner) {
      const hash = bcrypt.hashSync(bootstrapPassword, 12);
      db.prepare("INSERT INTO users (email,password_hash,name,role,email_verified,is_banned,must_change_password) VALUES (?,?,?,'superadmin',1,0,0)").run(ownerEmail, hash, 'Veyrion Owner');
      console.log('[DB] Owner account bootstrapped from the private Render environment.');
    } else {
      const state = db.prepare("SELECT id, must_change_password FROM users WHERE id = ?").get(owner.id);
      if (state && Number(state.must_change_password) === 1) {
        const hash = bcrypt.hashSync(bootstrapPassword, 12);
        db.prepare("UPDATE users SET password_hash = ?, role = 'superadmin', email_verified = 1, is_banned = 0, must_change_password = 0, updated_at = datetime('now') WHERE id = ?").run(hash, owner.id);
        db.prepare("DELETE FROM admin_sessions WHERE user_id = ?").run(owner.id);
        console.log('[DB] Owner bootstrap credentials synchronized and activated.');
      }
    }
  }
  console.log('[DB] Secure owner authentication schema ready.');
}
module.exports = { migrateSecureAdmin };
