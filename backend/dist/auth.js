import { Router } from 'express';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import * as db from './db.js';
const router = Router();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
const CLIENT_ID = process.env.CLIENT_ID_SSO || '';
const CLIENT_SECRET = process.env.CLIENT_SECRET_SSO || '';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';
// This callback goes through nginx proxy: frontend_host/api/auth/google/callback
const REDIRECT_URI = `${FRONTEND_URL}/api/auth/google/callback`;
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
// ─── Middleware ────────────────────────────────────────────────────────────────
export function requireAuth(req, res, next) {
    let token = req.cookies?.quiz_token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.substring(7);
    }
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    }
    catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
export function getAuthenticatedUser(req) {
    let token = req.cookies?.quiz_token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.substring(7);
    }
    if (!token)
        return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
}
export function requireAdmin(req, res, next) {
    const user = req.user;
    if (!user?.isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin only' });
        return;
    }
    next();
}
// ─── Auth Routes ───────────────────────────────────────────────────────────────
// Step 1: Redirect to Google consent
router.get('/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
        ],
        prompt: 'select_account',
    });
    res.redirect(url);
});
// Step 2: Handle callback from Google
router.get('/google/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        res.redirect(`${FRONTEND_URL}?auth_error=missing_code`);
        return;
    }
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data } = await oauth2.userinfo.get();
        const email = (data.email || '').toLowerCase().trim();
        const googleName = data.name || '';
        if (!email) {
            res.redirect(`${FRONTEND_URL}?auth_error=no_email`);
            return;
        }
        const isAdmin = email === ADMIN_EMAIL;
        // Check if user is allowed
        let name = googleName;
        let mssv = '';
        if (isAdmin) {
            // Admin always allowed
            name = googleName || 'Admin';
        }
        else {
            const dbUser = await db.getUserByEmail(email);
            if (!dbUser) {
                res.redirect(`${FRONTEND_URL}?auth_error=not_allowed`);
                return;
            }
            name = dbUser.name || googleName;
            mssv = dbUser.mssv || '';
        }
        const picture = data.picture || '';
        // Create JWT
        const payload = { email, name, mssv, isAdmin, picture };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('quiz_token', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            secure: process.env.NODE_ENV === 'production',
        });
        res.redirect(FRONTEND_URL);
    }
    catch (err) {
        console.error('OAuth callback error:', err);
        res.redirect(`${FRONTEND_URL}?auth_error=server_error`);
    }
});
// Get current user info
router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
});
// Get token for external scripts
router.get('/token', requireAuth, (req, res) => {
    const token = req.cookies?.quiz_token || req.headers.authorization?.substring(7);
    res.json({ token });
});
// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('quiz_token');
    res.json({ success: true });
});
export default router;
