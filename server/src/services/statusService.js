import { Incident } from '../models/index.js';
import { SERVICES, SEVERITY_RANK, serviceName } from '../domain/constants.js';

const DAY = 86400000;
export const HISTORY_DAYS = 45;

const worstState = (incs) => {
  if (!incs.length) return 'ok';
  return Math.min(...incs.map((i) => SEVERITY_RANK[i.severity])) <= 1 ? 'major' : 'degraded';
};

// Everything the public page needs, and nothing internal (no ids, roles, people or severities).
export async function buildPublicStatus() {
  const now = Date.now();
  const since = now - HISTORY_DAYS * DAY;
  const incs = await Incident.find({ $or: [{ isOpen: true }, { createdAt: { $gte: since } }, { resolvedAt: { $gte: since } }] }).lean();
  const today = Math.floor(now / DAY);

  const services = SERVICES.map((s) => {
    const mine = incs.filter((i) => i.service === s.id);
    const history = Array.from({ length: HISTORY_DAYS }, (_, k) => {
      const start = (today - (HISTORY_DAYS - 1 - k)) * DAY;
      const end = start + DAY;
      return worstState(mine.filter((i) => i.createdAt < end && (i.resolvedAt || now) >= start));
    });
    return { id: s.id, name: s.name, state: worstState(mine.filter((i) => i.isOpen)), history };
  });

  const view = (i) => ({
    code: i.code,
    title: i.title,
    service: serviceName(i.service),
    status: i.status,
    startedAt: i.createdAt,
    resolvedAt: i.resolvedAt,
    updates: (i.statusUpdates || []).map((u) => ({ state: u.state, text: u.text, ts: u.ts })),
  });

  return {
    generatedAt: now,
    overall: worstState(incs.filter((i) => i.isOpen)),
    services,
    active: incs.filter((i) => i.isOpen).sort((a, b) => b.createdAt - a.createdAt).map(view),
    recent: incs.filter((i) => !i.isOpen && now - i.resolvedAt < 14 * DAY).sort((a, b) => b.resolvedAt - a.resolvedAt).map(view),
  };
}
