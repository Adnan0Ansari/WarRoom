import { z } from 'zod';
import { Incident, User } from '../models/index.js';
import { can } from '../domain/rbac.js';
import { SEVERITY_IDS, STATUS_IDS, ROLE_IDS } from '../domain/constants.js';
import { appendEvents, subscriberCount } from './eventService.js';
import { httpError, ID_RE } from '../utils.js';

const text = (max) => z.string().trim().min(1).max(max);

// Which events a browser may send, who may send them, and what they must contain.
// Everything else (incident.created, alert.received, automatic pages) is server-only.
const RULES = {
  'message.posted': { perm: 'message', schema: z.object({ text: text(4000) }) },
  'action.logged': { perm: 'log_action', schema: z.object({ text: text(2000) }) },
  'decision.logged': { perm: 'log_decision', schema: z.object({ text: text(2000) }) },
  'escalation.acked': { perm: 'ack', schema: z.object({}), open: true },
  'incident.status_changed': {
    perm: 'change_status',
    schema: z.object({ to: z.enum(STATUS_IDS) }),
    prepare: ({ payload, inc }) => {
      if (payload.to === inc.status) throw httpError(409, 'The incident is already in that status.');
    },
  },
  'incident.severity_changed': {
    perm: 'change_severity',
    open: true,
    schema: z.object({ to: z.enum(SEVERITY_IDS) }),
    prepare: ({ payload, inc }) => {
      if (payload.to === inc.severity) throw httpError(409, 'The incident already has that severity.');
      payload.from = inc.severity; // the server decides "from", never the client
    },
  },
  'role.assigned': {
    perm: 'assign_roles',
    open: true,
    schema: z.object({ role: z.enum(ROLE_IDS), userId: z.string().min(1).max(40) }),
    prepare: async ({ payload }) => {
      const target = await User.findOne({ uid: payload.userId, disabled: false }).lean();
      if (!target) throw httpError(400, 'That person does not exist or is disabled.');
    },
  },
  'escalation.paged': {
    perm: 'page',
    open: true,
    schema: z.object({ userId: z.string().min(1).max(40) }),
    prepare: async ({ payload, inc }) => {
      const target = await User.findOne({ uid: payload.userId, disabled: false }).lean();
      if (!target) throw httpError(400, 'That person does not exist or is disabled.');
      payload.level = inc.level;
      payload.manual = true;
    },
  },
  'statuspage.updated': {
    perm: 'publish_status',
    schema: z.object({ text: text(2000), state: z.enum(STATUS_IDS) }),
    prepare: async ({ payload }) => {
      payload.notified = await subscriberCount();
    },
  },
};

export async function appendClientEvent(userDoc, input) {
  const rule = RULES[input?.type];
  if (!rule) throw httpError(400, 'That event type cannot be sent by a client.');
  const incidentId = String(input.incidentId || '');
  const inc = await Incident.findById(incidentId).lean();
  if (!inc) throw httpError(404, 'Incident not found.');

  const user = { id: userDoc.uid, role: userDoc.role };
  if (!can(user, inc, rule.perm)) throw httpError(403, 'You do not have permission to do that.');
  if (rule.open && !inc.isOpen) throw httpError(409, 'This incident is resolved. Reopen it first.');

  const payload = rule.schema.parse(input.payload || {});
  if (rule.prepare) await rule.prepare({ payload, inc, user });

  const id = ID_RE.test(String(input.id || '')) ? input.id : undefined;
  const [evt] = await appendEvents([{ id, incidentId, type: input.type, actor: userDoc.uid, payload }]);
  return evt || null; // null means the client retried an event we already stored
}
