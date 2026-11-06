
const { getDb } = require('../config/database');

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
  console.log('[DB] Secure owner authentication schema ready.');
}
module.exports = { migrateSecureAdmin };
