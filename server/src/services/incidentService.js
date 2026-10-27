import { User } from '../models/index.js';
import { rotation } from '../domain/oncall.js';
import { appendEvents } from './eventService.js';
import { httpError, newId } from '../utils.js';

// Declaring writes one burst of events: the incident, the three auto-assigned roles
// (on-call primary commands, secondary scribes, a comms-skilled teammate writes updates)
// and the first page. The page's side effects start the escalation timer.
export async function declareIncident({ title, severity, service, summary = '', source = 'manual', actor, alert }) {
  const users = await User.find({ disabled: false }).lean();
  const oncall = rotation(users).map((u) => u.uid);
  if (!oncall.length) throw httpError(409, 'Nobody is in the on-call rotation. Give at least one person an on-call position first.');

  const commander = oncall[0];
  const scribe = oncall[1] || oncall[0];
  const comms = users.find((u) => u.skills?.includes('comms') && u.uid !== commander && u.uid !== scribe)?.uid || oncall[2] || scribe;
  const id = 'inc_' + newId();
  const t = Date.now();

  const events = [
    { incidentId: id, type: 'incident.created', actor, ts: t, payload: { title, severity, service, summary, source, oncall: oncall.slice(0, 3) } },
    { incidentId: id, type: 'role.assigned', actor: 'system', ts: t + 1, payload: { role: 'commander', userId: commander, auto: true } },
    { incidentId: id, type: 'role.assigned', actor: 'system', ts: t + 2, payload: { role: 'scribe', userId: scribe, auto: true } },
    { incidentId: id, type: 'role.assigned', actor: 'system', ts: t + 3, payload: { role: 'comms', userId: comms, auto: true } },
    { id: `esc-${id}-1`, incidentId: id, type: 'escalation.paged', actor: 'system', ts: t + 4, payload: { level: 1, userId: oncall[0] } },
  ];
  if (alert) events.push({ incidentId: id, type: 'alert.received', actor: 'webhook', ts: t + 5, payload: alert });

  await appendEvents(events);
  return id;
}
