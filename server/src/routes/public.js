import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Subscriber } from '../models/index.js';
import { buildPublicStatus, HISTORY_DAYS } from '../services/statusService.js';
import { sendEmail } from '../services/providers.js';
import { config } from '../config.js';
import { asyncHandler, httpError, randomToken, validate } from '../utils.js';
import { log } from '../logger.js';

const router = Router();

let cache = { at: 0, data: null };
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    // A 3 second cache keeps a busy public page from hammering the database during an outage.
    if (!cache.data || Date.now() - cache.at > 3000) cache = { at: Date.now(), data: await buildPublicStatus() };
    res.set('Cache-Control', 'public, max-age=3');
    res.json({ ...cache.data, historyDays: HISTORY_DAYS });
  })
);

router.post(
  '/subscribe',
  rateLimit({ windowMs: 3600000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } }),
  validate(z.object({ email: z.string().trim().email('Enter a valid email address.').max(200) })),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase();
    if (await Subscriber.exists({ email })) throw httpError(409, 'That address is already subscribed.');
    const sub = await Subscriber.create({ email, token: randomToken(24) });
    sendEmail({ to: email, subject: 'You are subscribed to Tidewater status updates', text: `We will email you when an incident starts or changes.\n\nUnsubscribe any time: ${config.API_PUBLIC_URL}/api/public/unsubscribe/${sub.token}\n` }).catch((e) => log.warn('welcome email failed:', e.message));
    res.status(201).json({ ok: true });
  })
);

router.get(
  '/unsubscribe/:token',
  asyncHandler(async (req, res) => {
    const r = await Subscriber.deleteOne({ token: req.params.token });
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Unsubscribed</title><body style="font-family:system-ui;max-width:420px;margin:15vh auto;padding:0 20px"><h2>${r.deletedCount ? 'You are unsubscribed.' : 'That link is no longer valid.'}</h2><p>You will not get any more status emails from us.</p></body>`);
  })
);

export default router;
