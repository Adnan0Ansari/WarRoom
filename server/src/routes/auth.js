import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User, RefreshToken } from '../models/index.js';
import { config } from '../config.js';
import { asyncHandler, httpError, newId, randomToken, sha256, validate } from '../utils.js';
import { requireAuth, signAccess } from '../middleware/auth.js';
import { emitTeam } from '../services/socketHub.js';

const router = Router();
const COOKIE = 'wr_rt';
const GRACE_MS = 10000; // two tabs refreshing at once must not look like token theft
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);

const cookieOpts = () => ({ httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/api/auth', maxAge: config.REFRESH_TTL_DAYS * 86400000 });

async function issueRefresh(userUid, family = newId(), ua = '') {
  const raw = randomToken(48);
  const hash = sha256(raw);
  await RefreshToken.create({ userUid, tokenHash: hash, family, expiresAt: new Date(Date.now() + config.REFRESH_TTL_DAYS * 86400000), userAgent: String(ua).slice(0, 200) });
  return { raw, hash, family };
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again in a few minutes.' } });

router.post(
  '/login',
  loginLimiter,
  validate(z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    const ok = await bcrypt.compare(req.body.password, user?.passwordHash || DUMMY);
    if (!user || user.disabled || !ok) throw httpError(401, 'Email or password is incorrect.');
    const { raw } = await issueRefresh(user.uid, undefined, req.headers['user-agent']);
    res.cookie(COOKIE, raw, cookieOpts());
    res.json({ accessToken: signAccess(user), user: user.toPublic(true) });
  })
);

// Rotates the refresh token on every use. Presenting an already-used token after the grace
// window means it leaked, so the whole token family is revoked.
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[COOKIE];
    const fail = () => {
      res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
      throw httpError(401, 'Sign in required.');
    };
    if (!raw) return fail();
    const rec = await RefreshToken.findOne({ tokenHash: sha256(raw) });
    if (!rec || rec.expiresAt < new Date()) return fail();
    if (rec.revokedAt) {
      if (Date.now() - rec.revokedAt.getTime() > GRACE_MS) await RefreshToken.updateMany({ family: rec.family, revokedAt: null }, { revokedAt: new Date() });
      else if (!rec.replacedByHash) return fail();
      else {
        const user = await User.findOne({ uid: rec.userUid });
        if (!user || user.disabled) return fail();
        const next = await issueRefresh(user.uid, rec.family, req.headers['user-agent']);
        res.cookie(COOKIE, next.raw, cookieOpts());
        return res.json({ accessToken: signAccess(user), user: user.toPublic(true) });
      }
      return fail();
    }
    const user = await User.findOne({ uid: rec.userUid });
    if (!user || user.disabled) return fail();
    const next = await issueRefresh(user.uid, rec.family, req.headers['user-agent']);
    rec.revokedAt = new Date();
    rec.replacedByHash = next.hash;
    await rec.save();
    res.cookie(COOKIE, next.raw, cookieOpts());
    res.json({ accessToken: signAccess(user), user: user.toPublic(true) });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[COOKIE];
    if (raw) {
      const rec = await RefreshToken.findOne({ tokenHash: sha256(raw) });
      if (rec) await RefreshToken.updateMany({ family: rec.family, revokedAt: null }, { revokedAt: new Date() });
    }
    res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
    res.json({ ok: true });
  })
);

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.doc.toPublic(true) }));

router.patch(
  '/me',
  requireAuth,
  validate(z.object({ name: z.string().trim().min(1).max(80).optional(), phone: z.string().trim().max(24).regex(/^(\+?[0-9 ()-]{7,24})?$/, 'Use a phone number like +14155550123.').optional() })),
  asyncHandler(async (req, res) => {
    Object.assign(req.user.doc, req.body);
    await req.user.doc.save();
    emitTeam('team:changed', {});
    res.json({ user: req.user.doc.toPublic(true) });
  })
);

router.post(
  '/password',
  requireAuth,
  validate(z.object({ current: z.string().min(1).max(200), next: z.string().min(10, 'Use at least 10 characters.').max(200) })),
  asyncHandler(async (req, res) => {
    if (!(await bcrypt.compare(req.body.current, req.user.doc.passwordHash))) throw httpError(400, 'Your current password is wrong.');
    req.user.doc.passwordHash = await bcrypt.hash(req.body.next, 12);
    await req.user.doc.save();
    await RefreshToken.updateMany({ userUid: req.user.id, revokedAt: null }, { revokedAt: new Date() });
    const { raw } = await issueRefresh(req.user.id, undefined, req.headers['user-agent']);
    res.cookie(COOKIE, raw, cookieOpts());
    res.json({ ok: true });
  })
);

export default router;
