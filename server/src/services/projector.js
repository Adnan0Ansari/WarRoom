import { Event, Incident } from '../models/index.js';
import { foldIncident } from '../domain/fold.js';

// Wire format shared with the browser.
export const toWire = (d) => ({
  id: d.eid,
  incidentId: d.incidentId,
  type: d.type,
  actor: d.actor,
  ts: d.ts,
  payload: d.payload || {},
  cursor: String(d._id),
});

// Same-process mutex per key, so two appends to one incident project in order.
const locks = new Map();
export function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  next.catch(() => {}).finally(() => {
    if (locks.get(key) === next) locks.delete(key);
  });
  return next;
}

export async function loadEvents(incidentId) {
  const docs = await Event.find({ incidentId }).sort({ ts: 1, eid: 1 }).lean();
  return docs.map(toWire);
}

// Rebuilds the read model from the full event list. Always correct, never drifts.
// eventCount guards against a slow, stale projection overwriting a newer one.
export async function project(incidentId) {
  const events = await loadEvents(incidentId);
  const inc = foldIncident(incidentId, events);
  if (!inc) return null;
  const { events: _omit, ...doc } = inc;
  doc.eventCount = events.length;
  try {
    await Incident.updateOne(
      { _id: incidentId, $or: [{ eventCount: { $lte: doc.eventCount } }, { eventCount: { $exists: false } }] },
      { $set: doc },
      { upsert: true }
    );
  } catch (e) {
    if (e.code !== 11000) throw e; // a newer projection already exists
  }
  return doc;
}
