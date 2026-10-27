// Server-side authority for permissions. The client has a copy only to hide buttons.
const GLOBAL = {
  admin: '*',
  responder: ['declare', 'message', 'log_action', 'edit_runbook', 'ack'],
  viewer: [],
};

const INCIDENT_ROLE = {
  commander: ['message', 'log_action', 'log_decision', 'change_severity', 'change_status', 'assign_roles', 'page', 'publish_status', 'edit_runbook', 'ack'],
  scribe: ['message', 'log_action', 'log_decision', 'edit_runbook'],
  comms: ['message', 'publish_status'],
};

// user: { id, role }   incident: folded incident or projection (needs .roles)
export function can(user, incident, perm) {
  if (!user) return false;
  const base = GLOBAL[user.role];
  if (base === '*') return true;
  if (base && base.includes(perm)) return true;
  const roles = incident?.roles || {};
  return Object.entries(roles).some(([role, userId]) => userId === user.id && INCIDENT_ROLE[role]?.includes(perm));
}
