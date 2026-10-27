import { Event, Subscriber } from '../models/index.js';
import { toWire, project, withLock } from './projector.js';
import { emitTeam, emitPublicChanged } from './socketHub.js';
import { scheduleNext, cancelEscalation } from './escalation.js';
import { enqueuePage, enqueueSubscriberUpdate, enqueueRoleEmail } from './notify.js';
import { newId } from '../utils.js';
import { log } from '../logger.js';

// The single door into the event log. Everything that changes an incident goes through here:
// persist (idempotent by eid) -> rebuild projection -> broadcast -> side effects.
export async function appendEvents(list, { silent = false } = {}) {
  const inserted = [];
  for (const e of list) {
    const doc = {
      eid: e.id || newId(),
      incidentId: e.incidentId,
      type: e.type,
      actor: e.actor || 'system',
      ts: e.ts || Date.now(),
      payload: e.payload || {},
    };
    try {
      const saved = await Event.create(doc);
      inserted.push(toWire(saved.toObject()));
    } catch (err) {
      if (err.code === 11000) continue; // already stored: retries are safe
      throw err;
    }
  }
  if (!inserted.length) return [];

  const projections = {};
  for (const id of new Set(inserted.map((e) => e.incidentId))) {
    projections[id] = await withLock(id, () => project(id));
  }
  if (silent) return inserted;

  for (const e of inserted) emitTeam('event', e);
  for (const e of inserted) {
    try {
      await runEffects(e, projections[e.incidentId]);
    } catch (err) {
      log.error(`effects failed for ${e.type} on ${e.incidentId}:`, err.message);
    }
  }
  return inserted;
}

async function runEffects(evt, inc) {
  if (!inc) return;
  const q = evt.payload || {};
  switch (evt.type) {
    case 'incident.created':
      emitPublicChanged();
      break;
    case 'escalation.paged':
      await enqueuePage(evt, inc);
      if (!q.manual) await scheduleNext(inc);
      break;
    case 'escalation.acked':
      await cancelEscalation(inc.id);
      break;
    case 'incident.status_changed':
      if (q.to === 'resolved') await cancelEscalation(inc.id);
      emitPublicChanged();
      break;
    case 'incident.severity_changed':
      emitPublicChanged();
      break;
    case 'statuspage.updated':
      await enqueueSubscriberUpdate(evt, inc);
      emitPublicChanged();
      break;
    case 'role.assigned':
      if (!q.auto && q.userId !== evt.actor) await enqueueRoleEmail(evt, inc);
      break;
    default:
      break;
  }
}

export const subscriberCount = () => Subscriber.countDocuments();
