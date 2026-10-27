import { useStore } from '../store/useStore.js';

// Every action resolves to a result on success or null on failure (the store has already
// shown a toast), so callers never deal with unhandled rejections.
const send = (incidentId, type, payload) => useStore.getState().send({ incidentId, type, payload }).catch(() => null);

export const postMessage = (id, text) => send(id, 'message.posted', { text });
export const logAction = (id, text) => send(id, 'action.logged', { text });
export const logDecision = (id, text) => send(id, 'decision.logged', { text });
export const acknowledge = (id) => send(id, 'escalation.acked', {});
export const setStatus = (id, to) => send(id, 'incident.status_changed', { to });
export const setSeverity = (inc, to) => (to !== inc.severity ? send(inc.id, 'incident.severity_changed', { to }) : null);
export const assignRole = (id, role, userId) => send(id, 'role.assigned', { role, userId });
export const pageSomeone = (inc, userId) => send(inc.id, 'escalation.paged', { userId });

// Resolves to how many subscribers were emailed, or null on failure.
export async function publishStatus(id, text, state) {
  const r = await send(id, 'statuspage.updated', { text, state });
  return r ? r.event?.payload?.notified ?? 0 : null;
}

// Resolves to the new incident id, or null.
export const declareIncident = (input) => useStore.getState().declare(input).catch(() => null);
