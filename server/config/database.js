const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'database.sqlite');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let wrapper = null;

class DatabaseWrapper {
  constructor(sqliteDb, saveFn) {
    this._db = sqliteDb;
    this._saveToDisk = saveFn;
  }

  exec(sql) {
    this._db.exec(sql);
    this._persist();
  }

  pragma(str) {
    try { this._db.run(`PRAGMA ${str}`); } catch (_) {}
  }

  prepare(sql) {
    const db = this._db;
    const persist = () => this._persist();
    return {
      get(...params) {
        const stmt = db.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          if (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row = {};
            cols.forEach((c, i) => { row[c] = vals[i]; });
            return row;
          }
          return undefined;
        } finally {
          stmt.free();
        }
      },
      all(...params) {
        const results = [];
        const stmt = db.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          while (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row = {};
            cols.forEach((c, i) => { row[c] = vals[i]; });
            results.push(row);
          }
        } finally {
          stmt.free();
        }
        return results;
      },
      run(...params) {
        db.run(sql, params);
        const changes = db.getRowsModified();
        const lastId = db.exec("SELECT last_insert_rowid()");
        const lastInsertRowid = lastId.length > 0 ? lastId[0].values[0][0] : 0;
        persist();
        return { changes, lastInsertRowid };
      },
    };
  }

  _persist() {
    this._saveToDisk();
  }
}

function saveToDisk() {
  if (!wrapper) return;
  const tempPath = dbPath + '.' + process.pid + '.tmp';
  try {
    const data = wrapper._db.export();
    fs.writeFileSync(tempPath, Buffer.from(data), { mode: 0o600 });
    fs.renameSync(tempPath, dbPath);
  } catch (e) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    console.error('[DB] Atomic save failed:', e.message);
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  wrapper = new DatabaseWrapper(db, saveToDisk);
  wrapper.pragma('foreign_keys = ON');

  // Auto-save every 5 seconds
  const saveTimer = setInterval(() => saveToDisk(), 5000);
  if (typeof saveTimer.unref === 'function') saveTimer.unref();

  // Save on exit
  process.on('SIGTERM', saveToDisk);
  process.on('SIGINT', saveToDisk);

  if (process.env.NODE_ENV === 'production') {
    console.log(`[DB] Database: ${dbPath}`);
    if (dbPath.startsWith('/tmp/')) console.warn('[DB] WARNING: DATABASE_PATH is on ephemeral storage; records may be lost after restart or deploy.');
  }
  return wrapper;
}

function getDb() {
  if (wrapper) return wrapper;
  throw new Error('Database not initialized. Call initDatabase() first.');
}

module.exports = { initDatabase, getDb, _save: saveToDisk };
