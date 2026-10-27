import { Incident } from '../models/index.js';
import { appendEvents } from './eventService.js';
import { declareIncident } from './incidentService.js';
import { withRedisLock } from '../redis.js';
import { SEVERITY_LABEL } from '../domain/constants.js';

// Routes each normalised alert: attach to the open incident for that service, deduplicate,
// or declare a new one. A Redis lock per service stops two simultaneous alerts from
// declaring two incidents, even across several servers.
export async function ingestAlerts(alerts) {
  const results = [];
  for (const a of alerts) {
    const body = { source: a.source, name: a.name, detail: a.detail, state: a.state, fingerprint: a.fingerprint, severity: a.severity };
    const result = await withRedisLock(`ingest:${a.service}`, async () => {
      const open = await Incident.findOne({ isOpen: true, service: a.service }).sort({ createdAt: -1 }).lean();

      if (a.state === 'resolved') {
        if (!open) return { action: 'ignored', text: `"${a.name}" recovered but no incident is open for this service.` };
        await appendEvents([{ incidentId: open._id, type: 'alert.received', actor: 'webhook', payload: body }]);
        return { action: 'attached', incidentId: open._id, text: `Recovery for "${a.name}" added to ${open.code}.` };
      }

      if (open) {
        const last = [...(open.alerts || [])].reverse().find((x) => x.fingerprint === a.fingerprint);
        if (last && last.state === 'firing') return { action: 'ignored', incidentId: open._id, text: `"${a.name}" is already attached to ${open.code}. Deduplicated.` };
        await appendEvents([{ incidentId: open._id, type: 'alert.received', actor: 'webhook', payload: body }]);
        return { action: 'attached', incidentId: open._id, text: `"${a.name}" attached to open incident ${open.code}.` };
      }

      const id = await declareIncident({ title: a.name, severity: a.severity, service: a.service, summary: a.detail, source: a.source, actor: 'webhook', alert: body });
      return { action: 'created', incidentId: id, text: `Declared ${SEVERITY_LABEL[a.severity]} for "${a.name}" and paged on-call.` };
    });
    results.push(result);
  }
  return results;
}
