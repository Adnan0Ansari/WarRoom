import { Router } from 'express';
import { User } from '../models/index.js';
import { config, escalationSeconds } from '../config.js';
import { asyncHandler } from '../utils.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const out = { escalation: escalationSeconds, apiUrl: config.API_PUBLIC_URL, demo: { enabled: config.SEED_DEMO } };
    if (config.SEED_DEMO) {
      const users = await User.find({ disabled: false }).sort({ createdAt: 1 }).lean();
      out.demo.password = config.DEMO_PASSWORD;
      out.demo.accounts = users.slice(0, 8).map((u) => ({ email: u.email, name: u.name, title: u.title, role: u.role, id: u.uid }));
    }
    res.json(out);
  })
);

export default router;
