const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'database.sqlite');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let wrapper = null;
let remoteSnapshotEnabled = false;
let remoteDirty = false;
let backupTimer = null;
let backupInFlight = null;

function snapshotConfig() {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const token = process.env.SUPABASE_SNAPSHOT_TOKEN;
  if (!base || !apiKey || !token) return null;
  return { base, apiKey, token };
}

async function loadRemoteSnapshot() {
  const config = snapshotConfig();
  if (!config) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Persistent database storage is not configured. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SNAPSHOT_TOKEN.');
    }
    return null;
  }

  const response = await fetch(config.base + '/rest/v1/rpc/veyrion_load_snapshot', {
    method: 'POST',
    headers: { apikey: config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p_token: config.token }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error('Could not load the persistent database snapshot (' + response.status + '): ' + detail);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Persistent database snapshot returned an invalid response.');
  if (rows.length === 0) return null;

  const row = rows[0];
  const data = Buffer.from(String(row.payload_base64 || ''), 'base64');
  const digest = crypto.createHash('sha256').update(data).digest('hex');
  if (!data.length || data.length !== Number(row.byte_length) || digest !== row.sha256) {
    throw new Error('Persistent database snapshot failed its integrity check. Startup stopped to protect stored data.');
  }
  return data;
}

async function writeRemoteSnapshot() {
  const config = snapshotConfig();
  if (!config || !wrapper) throw new Error('Persistent database storage is unavailable.');

  const data = Buffer.from(wrapper._db.export());
  if (data.length > 5 * 1024 * 1024) {
    throw new Error('Database snapshot exceeds the 5 MB safety limit.');
  }

  const payload = {
    p_token: config.token,
    p_payload_base64: data.toString('base64'),
    p_sha256: crypto.createHash('sha256').update(data).digest('hex'),
    p_byte_length: data.length,
  };

  const response = await fetch(config.base + '/rest/v1/rpc/veyrion_store_snapshot', {
    method: 'POST',
    headers: { apikey: config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error('Persistent database snapshot could not be saved (' + response.status + '): ' + detail);
  }
}

function scheduleRemoteSnapshot() {
  if (!remoteSnapshotEnabled) return;
  remoteDirty = true;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = null;
    flushRemoteSnapshot().catch((error) => {
      console.error('[DB] Persistent snapshot failed:', error.message);
    });
  }, 900);
  if (backupTimer.unref) backupTimer.unref();
}

async function flushRemoteSnapshot() {
  if (!remoteSnapshotEnabled) return;
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }

  while (true) {
    if (backupInFlight) await backupInFlight;
    if (!remoteDirty) return;

    if (backupTimer) {
      clearTimeout(backupTimer);
      backupTimer = null;
    }

    remoteDirty = false;
    backupInFlight = writeRemoteSnapshot();
    try {
      await backupInFlight;
    } catch (error) {
      remoteDirty = true;
      throw error;
    } finally {
      backupInFlight = null;
    }
  }
}

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
    scheduleRemoteSnapshot();
  }
}

function saveToDisk() {
  if (!wrapper) return;
  try {
    const data = wrapper._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (e) {
    console.error('[DB] Local save error:', e.message);
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();
  const config = snapshotConfig();
  remoteSnapshotEnabled = Boolean(config);

  if (process.env.NODE_ENV === 'production' && !remoteSnapshotEnabled) {
    throw new Error('Persistent database storage is not configured. Refusing to start with temporary local storage.');
  }

  let db;
  if (remoteSnapshotEnabled) {
    const snapshot = await loadRemoteSnapshot();
    if (snapshot) {
      db = new SQL.Database(snapshot);
      console.log('[DB] Restored persistent Supabase snapshot (' + snapshot.length + ' bytes).');
    } else if (fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath));
      remoteDirty = true;
      console.log('[DB] No remote snapshot exists; retaining the local database for initial backup.');
    } else {
      db = new SQL.Database();
      remoteDirty = true;
      console.log('[DB] No previous snapshot found; initializing a fresh persistent database.');
    }
  } else if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  wrapper = new DatabaseWrapper(db, saveToDisk);
  wrapper.pragma('foreign_keys = ON');

  setInterval(() => {
    saveToDisk();
    if (remoteDirty && !backupTimer && !backupInFlight) scheduleRemoteSnapshot();
  }, 5000).unref();

  process.on('SIGTERM', saveToDisk);
  process.on('SIGINT', saveToDisk);

  if (process.env.NODE_ENV === 'production') {
    console.log('[DB] Local cache: ' + dbPath);
    console.log('[DB] Persistent storage: ' + (remoteSnapshotEnabled ? 'Supabase snapshot store' : 'disabled'));
  }
  return wrapper;
}

function getDb() {
  if (wrapper) return wrapper;
  throw new Error('Database not initialized. Call initDatabase() first.');
}

module.exports = {
  initDatabase,
  getDb,
  _save: saveToDisk,
  flushRemoteSnapshot,
  isRemoteSnapshotEnabled: () => remoteSnapshotEnabled,
};
