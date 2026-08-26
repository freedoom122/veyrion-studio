const db = require('../config/database');
const User = require('../models/User');
const { generateToken, generateRefreshToken } = require('../middleware/auth');
const { sendEmail } = require('../config/email');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const authController = {
  async register(req, res, next) {
    try {
      const { email, password, name, company, phone } = req.body;

      if (User.findByEmail(email)) {
        return res.status(409).json({
          success: false,
          error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists' }
        });
      }

      const user = User.create({ email, password, name, company, phone });
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      // Store refresh token
      db.prepare(`
        INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
        VALUES (?, ?, datetime('now', '+7 days'), ?, ?)
      `).run(user.id, refreshToken, req.ip, req.get('user-agent'));

      // Send verification email (non-blocking)
      sendEmail({
        to: user.email,
        subject: 'Welcome to Veyrion',
        html: `<p>Hi ${user.name},</p><p>Welcome to Veyrion. Your account is ready.</p>`,
      }).catch(() => {});

      res.status(201).json({
        success: true,
        data: {
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
          token,
          refreshToken,
        }
      });
    } catch (err) { next(err); }
  },

  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const user = User.findByEmail(email);
      if (!user || !User.verifyPassword(user, password)) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
        });
      }

      if (user.is_banned) {
        return res.status(403).json({
          success: false,
          error: { code: 'BANNED', message: 'Account has been suspended' }
        });
      }

      User.updateLastLogin(user.id);

      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      db.prepare(`
        INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
        VALUES (?, ?, datetime('now', '+7 days'), ?, ?)
      `).run(user.id, refreshToken, req.ip, req.get('user-agent'));

      // Admin audit log
      if (user.role === 'admin' || user.role === 'superadmin') {
        db.prepare(`
          INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, ip_address, user_agent)
          VALUES (?, 'login', 'user', ?, ?, ?)
        `).run(user.id, user.id, req.ip, req.get('user-agent'));
      }

      res.json({
        success: true,
        data: {
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
          token,
          refreshToken,
        }
      });
    } catch (err) { next(err); }
  },

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_TOKEN', message: 'Refresh token required' } });
      }

      const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')').get(refreshToken);
      if (!session) {
        return res.status(401).json({ success: false, error: { code: 'INVALID_REFRESH', message: 'Invalid refresh token' } });
      }

      const user = User.findById(session.user_id);
      if (!user) {
        return res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      }

      // Rotate refresh token
      db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
      const newRefreshToken = generateRefreshToken(user);
      db.prepare(`
        INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
        VALUES (?, ?, datetime('now', '+7 days'), ?, ?)
      `).run(user.id, newRefreshToken, req.ip, req.get('user-agent'));

      const token = generateToken(user);

      res.json({
        success: true,
        data: { token, refreshToken: newRefreshToken }
      });
    } catch (err) { next(err); }
  },

  async logout(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(decoded.id);
        } catch (_) {}
      }
      res.json({ success: true, data: { message: 'Logged out' } });
    } catch (err) { next(err); }
  },

  async getMe(req, res) {
    const user = User.findById(req.user.id);
    res.json({
      success: true,
      data: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        company: user.company, phone: user.phone, timezone: user.timezone,
        avatar_url: user.avatar_url, created_at: user.created_at
      }
    });
  },

  async updateProfile(req, res, next) {
    try {
      const user = User.update(req.user.id, req.body);
      res.json({ success: true, data: { id: user.id, email: user.email, name: user.name, company: user.company, phone: user.phone } });
    } catch (err) { next(err); }
  },

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const user = User.findByEmail(email);
      if (user) {
        const resetToken = crypto.randomBytes(32).toString('hex');
        db.prepare(`
          INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))
        `).run(user.id, `reset:${resetToken}`);

        sendEmail({
          to: user.email,
          subject: 'Password Reset Request',
          html: `<p>Hi ${user.name},</p><p>Click here to reset your password: ${process.env.FRONTEND_URL}/reset-password?token=${resetToken}</p><p>This link expires in 1 hour.</p>`,
        }).catch(() => {});
      }
      // Always return success to prevent email enumeration
      res.json({ success: true, data: { message: 'If an account exists, a reset link has been sent' } });
    } catch (err) { next(err); }
  },
};

module.exports = authController;
