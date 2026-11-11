const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const db = getDb();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured.');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '15m' }
  );
}

function generateRefreshToken(user) {
  if (!process.env.REFRESH_TOKEN_SECRET) throw new Error('REFRESH_TOKEN_SECRET must be configured.');
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, role, is_banned FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not found' }
      });
    }

    if (user.is_banned) {
      return res.status(403).json({
        success: false,
        error: { code: 'BANNED', message: 'Account has been suspended' }
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token expired' }
      });
    }
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' }
      });
    }
    next();
  };
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, role, is_banned FROM users WHERE id = ?').get(decoded.id);
    if (user && !user.is_banned) {
      req.user = user;
    }
  } catch (_) {
    // Token invalid, continue without auth
  }
  next();
}


async function requireCustomerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ success:false, error:{code:'UNAUTHORIZED',message:'Sign in to continue.'} });
  const token = header.slice(7).trim();
  const projectUrl = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!projectUrl || !publicKey) return res.status(503).json({ success:false, error:{code:'AUTH_UNAVAILABLE',message:'Account service is not configured yet.'} });
  try {
    const response = await fetch((projectUrl.endsWith('/') ? projectUrl.slice(0, -1) : projectUrl) + '/auth/v1/user', { headers:{ apikey:publicKey, Authorization:'Bearer ' + token }, signal:AbortSignal.timeout(8000) });
    if (!response.ok) return res.status(401).json({ success:false, error:{code:'INVALID_SESSION',message:'Your session expired. Please sign in again.'} });
    const account = await response.json();
    if (!account || !account.id || !account.email) return res.status(401).json({ success:false, error:{code:'INVALID_SESSION',message:'Please sign in again.'} });
    const metadata = account.user_metadata || {};
    const localUser = await resolveStoreCustomer(token);
    req.localUser = localUser;
    req.user = { id:account.id, email:account.email, name:metadata.full_name || metadata.name || account.email.split('@')[0], company:metadata.company || '', role:'customer' };
    req.customerAccessToken = token;
    next();
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success:false, error:{code:error.code || 'AUTH_ERROR',message:error.message} });
    }
    console.error('[AUTH] Supabase verification failed:', error.message);
    return res.status(503).json({ success:false, error:{code:'AUTH_UNAVAILABLE',message:'Account service is temporarily unavailable. Please try again.'} });
  }
}


async function resolveStoreCustomer(token) {
  const projectUrl = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!projectUrl || !publicKey) {
    const error = new Error('Account service is not configured.'); error.status = 503; error.code = 'AUTH_UNAVAILABLE'; throw error;
  }
  const response = await fetch((projectUrl.endsWith('/') ? projectUrl.slice(0, -1) : projectUrl) + '/auth/v1/user', {
    headers: { apikey: publicKey, Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const error = new Error('Your session expired. Please sign in again.'); error.status = 401; error.code = 'INVALID_SESSION'; throw error;
  }
  const account = await response.json();
  const supabaseId = String(account && account.id || '');
  const email = String(account && account.email || '').trim().toLowerCase();
  if (!supabaseId || !email) {
    const error = new Error('Please sign in again.'); error.status = 401; error.code = 'INVALID_SESSION'; throw error;
  }

  let user = db.prepare('SELECT * FROM users WHERE supabase_user_id = ? LIMIT 1').get(supabaseId);
  if (!user) {
    const existing = db.prepare('SELECT * FROM users WHERE lower(email) = ? LIMIT 1').get(email);
    if (existing) {
      if (existing.role !== 'customer' || (existing.supabase_user_id && existing.supabase_user_id !== supabaseId)) {
        const error = new Error('This account cannot be linked to the store identity. Contact support.'); error.status = 403; error.code = 'ACCOUNT_LINK_DENIED'; throw error;
      }
      db.prepare("UPDATE users SET supabase_user_id = ?, email_verified = 1, updated_at = datetime('now') WHERE id = ?").run(supabaseId, existing.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
    } else {
      const metadata = account.user_metadata || {};
      const name = String(metadata.full_name || metadata.name || email.split('@')[0]).trim().slice(0, 100) || 'Customer';
      const company = String(metadata.company || '').trim().slice(0, 120) || null;
      const passwordHash = bcrypt.hashSync(crypto.randomBytes(48).toString('hex'), 12);
      const result = db.prepare("INSERT INTO users (email, password_hash, supabase_user_id, name, company, role, email_verified) VALUES (?, ?, ?, ?, ?, 'customer', 1)")
        .run(email, passwordHash, supabaseId, name, company);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }
  }
  if (!user || user.is_banned) {
    const error = new Error('Account has been suspended.'); error.status = 403; error.code = 'BANNED'; throw error;
  }
  if (user.role !== 'customer') {
    const error = new Error('This identity is not permitted to use customer store endpoints.'); error.status = 403; error.code = 'ACCOUNT_LINK_DENIED'; throw error;
  }
  if (String(user.email || '').toLowerCase() !== email) {
    const conflict = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id <> ? LIMIT 1').get(email, user.id);
    if (conflict) {
      const error = new Error('This email address is already linked to another account.'); error.status = 409; error.code = 'EMAIL_CONFLICT'; throw error;
    }
    db.prepare("UPDATE users SET email = ?, email_verified = 1, updated_at = datetime('now') WHERE id = ?").run(email, user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }
  return user;
}

async function requireStoreAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } });
  try {
    req.user = await resolveStoreCustomer(header.slice(7).trim());
    next();
  } catch (error) {
    if (error.status === 503) console.error('[AUTH] Store account service unavailable:', error.message);
    return res.status(error.status || 503).json({ success: false, error: { code: error.code || 'AUTH_UNAVAILABLE', message: error.message || 'Account service is temporarily unavailable.' } });
  }
}

async function optionalStoreAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header) return next();
  if (!header.startsWith('Bearer ')) return res.status(401).json({ success: false, error: { code: 'INVALID_SESSION', message: 'Please sign in again.' } });
  try {
    req.user = await resolveStoreCustomer(header.slice(7).trim());
    next();
  } catch (error) {
    return res.status(error.status || 503).json({ success: false, error: { code: error.code || 'AUTH_UNAVAILABLE', message: error.message || 'Account service is temporarily unavailable.' } });
  }
}

module.exports = { generateToken, generateRefreshToken, requireAuth, requireCustomerAuth, requireRole, optionalAuth, requireStoreAuth, optionalStoreAuth };
