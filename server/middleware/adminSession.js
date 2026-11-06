
const crypto = require('crypto');
const { getDb } = require('../config/database');

const COOKIE_NAME = 'veyrion_admin_session';
const SESSION_HOURS = 8;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/admin',
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  };
}
function setAdminCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}
function clearAdminCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/admin',
  });
}
function requireAdminSession(req, res, next) {
  try {
    const rawToken = req.cookies && req.cookies[COOKIE_NAME];
    const ownerEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!rawToken || !ownerEmail) {
      clearAdminCookie(res);
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } });
    }
    const db = getDb();
    const session = db.prepare(
      "SELECT s.id AS session_id, s.token_hash, u.id, u.email, u.name, u.role, " +
      "u.is_banned, u.must_change_password, u.password_hash " +
      "FROM admin_sessions s JOIN users u ON u.id = s.user_id " +
      "WHERE s.token_hash = ? AND s.expires_at > datetime('now')"
    ).get(hashToken(rawToken));
    if (!session || String(session.email || '').toLowerCase() !== ownerEmail ||
        session.role !== 'superadmin' || session.is_banned) {
      clearAdminCookie(res);
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Your owner session has expired. Please sign in again.' } });
    }
    db.prepare("UPDATE admin_sessions SET last_seen_at = datetime('now') WHERE id = ?").run(session.session_id);
    req.user = session;
    req.adminSession = { id: session.session_id, tokenHash: session.token_hash };
    next();
  } catch (error) {
    next(error);
  }
}
function requirePasswordChanged(req, res, next) {
  if (req.user && Number(req.user.must_change_password) === 1) {
    return res.status(423).json({
      success: false,
      error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before opening the admin panel.' },
    });
  }
  next();
}
function requireSameOrigin(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const expected = req.protocol + '://' + req.get('host');
    if (origin && origin !== expected) {
      return res.status(403).json({ success: false, error: { code: 'BAD_ORIGIN', message: 'This request did not come from the admin site.' } });
    }
  }
  next();
}
module.exports = {
  COOKIE_NAME, hashToken, setAdminCookie, clearAdminCookie,
  requireAdminSession, requirePasswordChanged, requireSameOrigin,
};
