const jwt = require('jsonwebtoken');
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
    req.user = { id:account.id, email:account.email, name:metadata.full_name || metadata.name || account.email.split('@')[0], company:metadata.company || '', role:'customer' };
    req.customerAccessToken = token;
    next();
  } catch (error) {
    console.error('[AUTH] Supabase verification failed:', error.message);
    return res.status(503).json({ success:false, error:{code:'AUTH_UNAVAILABLE',message:'Account service is temporarily unavailable. Please try again.'} });
  }
}

module.exports = { generateToken, generateRefreshToken, requireAuth, requireCustomerAuth, requireRole, optionalAuth };
