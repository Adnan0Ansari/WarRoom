import { Router } from 'express';
import { z } from 'zod';
import { Integration, WebhookDelivery } from '../models/index.js';
import { asyncHandler, httpError, randomToken, validate } from '../utils.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const view = (i) => ({ id: String(i._id), name: i.name, source: i.source, token: i.token, enabled: i.enabled, lastUsedAt: i.lastUsedAt, createdAt: i.createdAt });

router.get('/', asyncHandler(async (req, res) => res.json({ integrations: (await Integration.find().sort({ createdAt: 1 }).lean()).map(view) })));

router.get(
  '/deliveries',
  asyncHandler(async (req, res) => {
    const list = await WebhookDelivery.find().sort({ ts: -1 }).limit(Math.min(Number(req.query.limit) || 30, 100)).lean();
    res.json({ deliveries: list.map((d) => ({ id: String(d._id), integration: d.integrationName, source: d.source, status: d.status, results: d.results, error: d.error, bytes: d.bytes, ts: d.ts })) });
  })
);

router.post(
  '/',
  validate(z.object({ name: z.string().trim().min(1).max(60), source: z.enum(['prometheus', 'datadog', 'custom']) })),
  asyncHandler(async (req, res) => {
    const doc = await Integration.create({ ...req.body, token: randomToken(24), createdBy: req.user.id });
    res.status(201).json({ integration: view(doc) });
  })
);

router.patch(
  '/:id',
  validate(z.object({ enabled: z.boolean().optional(), name: z.string().trim().min(1).max(60).optional(), rotate: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const doc = await Integration.findById(req.params.id);
    if (!doc) throw httpError(404, 'No such integration.');
    const { rotate, ...rest } = req.body;
    Object.assign(doc, rest);
    if (rotate) doc.token = randomToken(24);
    await doc.save();
    res.json({ integration: view(doc) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await Integration.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  })
);

export default router;
