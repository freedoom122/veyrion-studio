
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { sendEmail, isEmailConfigured } = require('../config/email');
const { hashToken, setAdminCookie, clearAdminCookie } = require('../middleware/adminSession');

const LEGACY_SEED_PASSWORD = 'CHANGE_ME_TO_A_STRONG_PASSWORD';
const MIN_PASSWORD_LENGTH = 14;
const MAX_BCRYPT_BYTES = 72;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
function safeUser(user) {
  return {
    id: user.id, email: user.email, name: user.name, role: user.role,
    mustChangePassword: Number(user.must_change_password) === 1,
    lastLogin: user.last_login || null,
  };
}
function configuredOwnerEmail() {
  return String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
}
function getOwner() {
  const email = configuredOwnerEmail();
  if (!email) return null;
  return getDb().prepare('SELECT * FROM users WHERE lower(email) = ? LIMIT 1').get(email) || null;
}
function isLegacyOwner(owner) {
  return Boolean(owner && owner.password_hash && bcrypt.compareSync(LEGACY_SEED_PASSWORD, owner.password_hash));
}
function setupStatus(req, res) {
  const bootstrapPassword = process.env.ADMIN_PASSWORD || '';
  const owner = getOwner();
  const setupRequired = Boolean(!owner || isLegacyOwner(owner));
  const available = Boolean(configuredOwnerEmail() && bootstrapPassword && setupRequired);
  res.json({
    success: true,
    data: {
      available,
      required: setupRequired,
      configured: Boolean(bootstrapPassword),
      message: available ? 'One-time owner setup is available.' : 'Owner setup is already closed or not configured.',
    },
  });
}
async function setup(req, res, next) {
  try {
    const adminEmail = configuredOwnerEmail();
    const bootstrapPassword = process.env.ADMIN_PASSWORD || '';
    const submittedEmail = String(req.body.email || '').trim().toLowerCase();
    const submittedKey = String(req.body.setupKey || '');
    const name = String(req.body.name || '').trim().slice(0, 100);
    if (!adminEmail || !bootstrapPassword) {
      return res.status(503).json({ success: false, error: { code: 'SETUP_NOT_CONFIGURED', message: 'Owner setup is not configured on the server.' } });
    }
    if (submittedEmail !== adminEmail || !safeEqual(submittedKey, bootstrapPassword)) {
      return res.status(403).json({ success: false, error: { code: 'SETUP_DENIED', message: 'The owner details or one-time setup key are incorrect.' } });
    }
    if (name.length < 2) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Enter your name.' } });
    }
    const db = getDb();
    const owner = getOwner();
    if (owner && !isLegacyOwner(owner)) {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_SETUP', message: 'The owner account has already been activated. Sign in instead.' } });
    }
    const passwordHash = bcrypt.hashSync(bootstrapPassword, 12);
    if (owner) {
      db.prepare(
        "UPDATE users SET password_hash = ?, name = ?, role = 'superadmin', email_verified = 1, " +
        "is_banned = 0, ban_reason = NULL, must_change_password = 1, updated_at = datetime('now') WHERE id = ?"
      ).run(passwordHash, name, owner.id);
    } else {
      db.prepare(
        "INSERT INTO users (email, password_hash, name, role, email_verified, must_change_password) " +
        "VALUES (?, ?, ?, 'superadmin', 1, 1)"
      ).run(adminEmail, passwordHash, name);
    }
    res.json({ success: true, data: { message: 'Owner account activated. Sign in with the temporary password, then replace it immediately.' } });
  } catch (error) {
    next(error);
  }
}
async function login(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const ownerEmail = configuredOwnerEmail();
    if (!ownerEmail || email !== ownerEmail) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }
    const db = getDb();
    const user = getOwner();
    if (!user || user.role !== 'superadmin' || user.is_banned || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    db.prepare(
      "INSERT INTO admin_sessions (user_id, token_hash, expires_at, ip_address, user_agent) " +
      "VALUES (?, ?, datetime('now', '+8 hours'), ?, ?)"
    ).run(user.id, tokenHash, req.ip || '', String(req.get('user-agent') || '').slice(0, 500));
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
    db.prepare(
      "INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, ip_address, user_agent) " +
      "VALUES (?, 'owner_login', 'user', ?, ?, ?)"
    ).run(user.id, user.id, req.ip || '', String(req.get('user-agent') || '').slice(0, 500));
    setAdminCookie(res, token);

    if (isEmailConfigured()) {
      const when = new Date().toISOString();
      const ip = escapeHtml(req.ip || 'Unavailable');
      const agent = escapeHtml(String(req.get('user-agent') || 'Unavailable').slice(0, 500));
      try {
        await sendEmail({
          to: ownerEmail,
          subject: '[Veyrion] Admin sign-in detected',
          text: 'A sign-in to your Veyrion admin panel was successful.\nTime: ' + when + '\nIP: ' + (req.ip || 'Unavailable') + '\nDevice: ' + (req.get('user-agent') || 'Unavailable'),
          html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#202630">' +
            '<p style="letter-spacing:3px;color:#9a7950;font-size:11px">VEYRION / SECURITY</p>' +
            '<h2>Admin sign-in detected</h2><p>A successful sign-in was made to your private admin panel.</p>' +
            '<p><strong>Time:</strong> ' + escapeHtml(when) + '</p>' +
            '<p><strong>IP:</strong> ' + ip + '</p><p><strong>Device:</strong> ' + agent + '</p>' +
            '<p style="color:#6b7280">If this was not you, reset your password immediately.</p></div>',
        });
      } catch (mailError) {
        console.error('[ADMIN AUTH] Sign-in alert email failed:', mailError.message);
      }
    } else {
      console.warn('[ADMIN AUTH] SMTP is not configured; sign-in alert email was not delivered.');
    }
    return res.json({ success: true, data: { user: safeUser(user) } });
  } catch (error) {
    next(error);
  }
}
function me(req, res) {
  res.json({ success: true, data: { user: safeUser(req.user) } });
}
function logout(req, res, next) {
  try {
    getDb().prepare('DELETE FROM admin_sessions WHERE id = ?').run(req.adminSession.id);
    clearAdminCookie(res);
    res.json({ success: true, data: { message: 'Signed out.' } });
  } catch (error) {
    next(error);
  }
}
async function changePassword(req, res, next) {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!bcrypt.compareSync(currentPassword, req.user.password_hash)) {
      return res.status(400).json({ success: false, error: { code: 'CURRENT_PASSWORD', message: 'Your current password is incorrect.' } });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(newPassword, 'utf8') > MAX_BCRYPT_BYTES) {
      return res.status(400).json({ success: false, error: { code: 'PASSWORD_POLICY', message: 'Use at least 14 characters. Maximum length is 72 UTF-8 bytes.' } });
    }
    if (process.env.ADMIN_PASSWORD && safeEqual(newPassword, process.env.ADMIN_PASSWORD)) {
      return res.status(400).json({ success: false, error: { code: 'TEMPORARY_PASSWORD', message: 'Choose a different password from the temporary setup password.' } });
    }
    const db = getDb();
    const newHash = bcrypt.hashSync(newPassword, 12);
    const newToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = hashToken(newToken);
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?").run(newHash, req.user.id);
    db.prepare("UPDATE admin_sessions SET token_hash = ?, expires_at = datetime('now', '+8 hours'), last_seen_at = datetime('now') WHERE id = ?").run(newTokenHash, req.adminSession.id);
    db.prepare('DELETE FROM admin_sessions WHERE user_id = ? AND id <> ?').run(req.user.id, req.adminSession.id);
    db.prepare(
      "INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, ip_address, user_agent) VALUES (?, 'password_changed', 'user', ?, ?, ?)"
    ).run(req.user.id, req.user.id, req.ip || '', String(req.get('user-agent') || '').slice(0, 500));
    setAdminCookie(res, newToken);
    if (isEmailConfigured()) {
      sendEmail({
        to: configuredOwnerEmail(),
        subject: '[Veyrion] Admin password changed',
        text: 'The password for your Veyrion admin account was changed at ' + new Date().toISOString() + '. If this was not you, reset your password immediately.',
        html: '<p>The password for your Veyrion admin account was changed. If this was not you, reset your password immediately.</p>',
      }).catch((mailError) => console.error('[ADMIN AUTH] Password-change alert failed:', mailError.message));
    }
    const updatedUser = Object.assign({}, req.user, { must_change_password: 0 });
    res.json({ success: true, data: { user: safeUser(updatedUser), message: 'Password updated.' } });
  } catch (error) {
    next(error);
  }
}
async function forgotPassword(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const ownerEmail = configuredOwnerEmail();
    if (!isEmailConfigured()) {
      return res.status(503).json({ success: false, error: { code: 'EMAIL_UNAVAILABLE', message: 'Password recovery email is not configured on the server yet.' } });
    }
    const owner = getOwner();
    if (owner && email === ownerEmail) {
      const db = getDb();
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      db.prepare('DELETE FROM admin_password_resets WHERE user_id = ?').run(owner.id);
      db.prepare("INSERT INTO admin_password_resets (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+30 minutes'))").run(owner.id, tokenHash);
      const panelUrl = String(process.env.ADMIN_PANEL_URL || 'https://veyrion-studio.onrender.com/admin/').replace(/\/$/, '');
      const resetUrl = panelUrl + '/#token=' + encodeURIComponent(token);
      try {
        await sendEmail({
          to: ownerEmail,
          subject: '[Veyrion] Reset your admin password',
          text: 'A password reset was requested for your Veyrion admin account. Use this one-time link within 30 minutes: ' + resetUrl + '\nIf you did not request this, ignore this email.',
          html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#202630">' +
            '<p style="letter-spacing:3px;color:#9a7950;font-size:11px">VEYRION / SECURITY</p>' +
            '<h2>Reset your admin password</h2><p>This one-time link expires in <strong>30 minutes</strong>.</p>' +
            '<p><a href="' + escapeHtml(resetUrl) + '" style="display:inline-block;background:#b99a72;color:#111;padding:12px 18px;text-decoration:none">Reset password</a></p>' +
            '<p>If you did not request this, ignore this email.</p></div>',
        });
      } catch (mailError) {
        db.prepare('DELETE FROM admin_password_resets WHERE token_hash = ?').run(tokenHash);
        console.error('[ADMIN AUTH] Password reset email failed:', mailError.message);
        return res.status(503).json({ success: false, error: { code: 'EMAIL_FAILED', message: 'The reset email could not be sent. Try again later.' } });
      }
    }
    res.json({ success: true, data: { message: 'If the owner account matches that email, a reset link has been sent.' } });
  } catch (error) {
    next(error);
  }
}
async function resetPassword(req, res, next) {
  try {
    const token = String(req.body.token || '');
    const newPassword = String(req.body.newPassword || '');
    if (!token || newPassword.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(newPassword, 'utf8') > MAX_BCRYPT_BYTES) {
      return res.status(400).json({ success: false, error: { code: 'PASSWORD_POLICY', message: 'The reset link or password is invalid. Use at least 14 characters and no more than 72 UTF-8 bytes.' } });
    }
    const db = getDb();
    const reset = db.prepare(
      "SELECT r.id, r.user_id FROM admin_password_resets r JOIN users u ON u.id = r.user_id " +
      "WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > datetime('now') " +
      "AND lower(u.email) = ? AND u.role = 'superadmin'"
    ).get(hashToken(token), configuredOwnerEmail());
    if (!reset) {
      return res.status(400).json({ success: false, error: { code: 'RESET_INVALID', message: 'This reset link is invalid, expired, or already used. Request a new one.' } });
    }
    const passwordHash = bcrypt.hashSync(newPassword, 12);
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?").run(passwordHash, reset.user_id);
    db.prepare("UPDATE admin_password_resets SET used_at = datetime('now') WHERE id = ?").run(reset.id);
    db.prepare('DELETE FROM admin_sessions WHERE user_id = ?').run(reset.user_id);
    if (isEmailConfigured()) {
      sendEmail({
        to: configuredOwnerEmail(),
        subject: '[Veyrion] Admin password reset completed',
        text: 'Your Veyrion admin password was reset at ' + new Date().toISOString() + '. All existing admin sessions were signed out.',
        html: '<p>Your Veyrion admin password was reset. All existing admin sessions were signed out.</p>',
      }).catch((mailError) => console.error('[ADMIN AUTH] Password-reset alert failed:', mailError.message));
    }
    res.json({ success: true, data: { message: 'Password reset. You can now sign in with your new password.' } });
  } catch (error) {
    next(error);
  }
}
module.exports = { setupStatus, setup, login, me, logout, changePassword, forgotPassword, resetPassword };
