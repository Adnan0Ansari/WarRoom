import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Integration, WebhookDelivery } from '../models/index.js';
import { normalizeAlerts } from '../domain/normalize.js';
import { ingestAlerts } from '../services/webhookService.js';
import { asyncHandler, httpError } from '../utils.js';

const router = Router();

// One budget per token, so a noisy monitor cannot starve the others.
const limiter = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.params.token, validate: false, message: { error: 'Too many alerts. Slow down.' } });

router.post(
  '/:source/:token',
  limiter,
  asyncHandler(async (req, res) => {
    const integration = await Integration.findOne({ token: req.params.token });
    if (!integration || !integration.enabled || integration.source !== req.params.source) throw httpError(404, 'Unknown or disabled integration.');
    const bytes = Number(req.headers['content-length']) || 0;
    const record = { integrationId: String(integration._id), integrationName: integration.name, source: integration.source, bytes };
    try {
      const alerts = normalizeAlerts(integration.source, req.body);
      const results = await ingestAlerts(alerts);
      integration.lastUsedAt = new Date();
      await integration.save();
      await WebhookDelivery.create({ ...record, status: 'ok', results });
      res.status(202).json({ accepted: alerts.length, results });
    } catch (err) {
      await WebhookDelivery.create({ ...record, status: 'error', error: err.message }).catch(() => {});
      throw err;
    }
  })
);

export default router;
