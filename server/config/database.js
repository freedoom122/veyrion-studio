const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Render persistent disk mounts at /var/data
// Local dev uses ./server/database/database.sqlite
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'database.sqlite');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Log database location in production
if (process.env.NODE_ENV === 'production') {
  console.log(`[DB] Database: ${dbPath}`);
}

module.exports = db;
