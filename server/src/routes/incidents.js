import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Event, Incident, Notification, Postmortem } from '../models/index.js';
import { asyncHandler, httpError, validate } from '../utils.js';
import { requireAuth } from '../middleware/auth.js';
import { toWire } from '../services/projector.js';
import { can } from '../domain/rbac.js';

const router = Router();
router.use(requireAuth);

// Bulk read of the event log. `after` pages through everything on first load;
// `since` is a time-based catch-up after a dropped connection (clients dedupe by id).
router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5000, 10000);
    const q = {};
    let order = { _id: 1 };
    if (req.query.since) {
      q.ts = { $gte: Number(req.query.since) || 0 };
      order = { ts: 1, _id: 1 };
    } else if (req.query.after && mongoose.isValidObjectId(req.query.after)) {
      q._id = { $gt: req.query.after };
    }
    const docs = await Event.find(q).sort(order).limit(limit + 1).lean();
    const more = docs.length > limit;
    const page = more ? docs.slice(0, limit) : docs;
    res.json({ events: page.map(toWire), cursor: page.length ? String(page[page.length - 1]._id) : req.query.after || null, more });
  })
);

router.get(
  '/incidents',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.open === 'true') filter.isOpen = true;
    if (req.query.service) filter.service = String(req.query.service);
    const list = await Incident.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ incidents: list });
  })
);

router.get(
  '/incidents/:id',
  asyncHandler(async (req, res) => {
    const inc = await Incident.findById(req.params.id).lean();
    if (!inc) throw httpError(404, 'Incident not found.');
    res.json({ incident: inc });
  })
);

router.get(
  '/incidents/:id/notifications',
  asyncHandler(async (req, res) => {
    const list = await Notification.find({ incidentId: req.params.id }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ notifications: list });
  })
);

// Postmortem edits are shared and last-write-wins; the draft itself is generated in the browser.
async function editable(req) {
  const inc = await Incident.findById(req.params.id).lean();
  if (!inc) throw httpError(404, 'Incident not found.');
  if (!can({ id: req.user.id, role: req.user.role }, inc, 'edit_runbook')) throw httpError(403, 'You do not have permission to edit the postmortem.');
}

router.get(
  '/incidents/:id/postmortem',
  asyncHandler(async (req, res) => {
    const pm = await Postmortem.findOne({ incidentId: req.params.id }).lean();
    res.json({ text: pm ? pm.text : null, updatedBy: pm?.updatedBy || null, updatedAt: pm?.updatedAt || null });
  })
);

router.put(
  '/incidents/:id/postmortem',
  validate(z.object({ text: z.string().max(100000) })),
  asyncHandler(async (req, res) => {
    await editable(req);
    const pm = await Postmortem.findOneAndUpdate({ incidentId: req.params.id }, { $set: { text: req.body.text, updatedBy: req.user.id } }, { upsert: true, new: true });
    res.json({ updatedAt: pm.updatedAt });
  })
);

router.delete(
  '/incidents/:id/postmortem',
  asyncHandler(async (req, res) => {
    await editable(req);
    await Postmortem.deleteOne({ incidentId: req.params.id });
    res.json({ ok: true });
  })
);

export default router;
