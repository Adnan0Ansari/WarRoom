import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, RefreshToken } from '../models/index.js';
import { asyncHandler, httpError, newId, randomToken, validate } from '../utils.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { emitTeam } from '../services/socketHub.js';

const router = Router();
router.use(requireAuth);

const SKILLS = z.array(z.enum(['commander', 'scribe', 'comms'])).max(3);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await User.find().sort({ createdAt: 1 });
    const admin = req.user.role === 'admin';
    res.json({ users: users.filter((u) => admin || !u.disabled).map((u) => u.toPublic(admin || u.uid === req.user.id)) });
  })
);

router.post(
  '/',
  requireRole('admin'),
  validate(
    z.object({
      name: z.string().trim().min(1).max(80),
      email: z.string().email().max(200),
      title: z.string().trim().max(80).default(''),
      role: z.enum(['admin', 'responder', 'viewer']).default('responder'),
      oncall: z.number().int().min(1).max(20).nullable().default(null),
      skills: SKILLS.default([]),
      password: z.string().min(10).max(200).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { password, ...rest } = req.body;
    if (await User.exists({ email: rest.email.toLowerCase() })) throw httpError(409, 'Someone with that email already exists.');
    const temp = password || randomToken(9);
    const user = await User.create({ ...rest, uid: 'u_' + newId().slice(0, 8), hue: Math.floor(Math.random() * 360), passwordHash: await bcrypt.hash(temp, 12) });
    emitTeam('team:changed', {});
    res.status(201).json({ user: user.toPublic(true), temporaryPassword: password ? undefined : temp });
  })
);

router.patch(
  '/:uid',
  requireRole('admin'),
  validate(
    z.object({
      name: z.string().trim().min(1).max(80).optional(),
      title: z.string().trim().max(80).optional(),
      role: z.enum(['admin', 'responder', 'viewer']).optional(),
      oncall: z.number().int().min(1).max(20).nullable().optional(),
      skills: SKILLS.optional(),
      phone: z.string().trim().max(24).optional(),
      disabled: z.boolean().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ uid: req.params.uid });
    if (!user) throw httpError(404, 'No such user.');
    const losingAdmin = user.role === 'admin' && !user.disabled && (req.body.role === 'responder' || req.body.role === 'viewer' || req.body.disabled === true);
    if (losingAdmin) {
      if (user.uid === req.user.id) throw httpError(409, 'You cannot demote or disable yourself.');
      if ((await User.countDocuments({ role: 'admin', disabled: false, uid: { $ne: user.uid } })) < 1) throw httpError(409, 'There must always be at least one active admin.');
    }
    Object.assign(user, req.body);
    await user.save();
    if (req.body.disabled) await RefreshToken.updateMany({ userUid: user.uid, revokedAt: null }, { revokedAt: new Date() });
    emitTeam('team:changed', {});
    res.json({ user: user.toPublic(true) });
  })
);

export default router;
